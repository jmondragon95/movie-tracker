//  Imports

import express from "express";
import mysql from "mysql2/promise";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import configDotenv from "dotenv";
import cookieParser from "cookie-parser";
import crypto from "crypto";


//  Global Variables

configDotenv.config();  //  allows us to use .env file variables
const app = express();
const pool = mysql.createPool({
  host: process.env.DATABASE_HOST,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  connectionLimit: 10,
  waitForConnections: true,
});
const mySQLConnection = await pool.getConnection();
let apiKey = "683b5907";
let page = 1;

//  Setup view engine and public (static) directory

app.set("view engine", "ejs");
app.use(express.static("public"));
app.use(express.urlencoded({extended: true}));  //  Allows us to read body from post requests
app.use(express.json());  //  Allows routes to read json
app.use(cookieParser());  //  Allows read/write of cookies

//  Functions

async function authenticateToken(req, res, next) {
  //  RETRIEVE COOKIE FROM REQUEST COOKIES
  const accessToken = req.cookies.accessToken;
  if (accessToken) {
    //  ACCESS TOKEN IS FOUND, LETS TRY VERIFYING IT
    try {
      // IF VERIFICATION SUCCEEDS (NOT EXPIRED AND IS VALID, GO NEXT
      const accessTokenPayload = jwt.verify(accessToken, process.env.ACCESS_TOKEN_SECRET);
      const userId = accessTokenPayload.userId;
      req.userId = userId;
      return next();
    } catch (error) {
      //  IF TOKEN IS EXPIRED, THEN USE REFRESH TOKEN TO RETRIEVE NEW (ACCESS AND REFRESH) TOKENS
      if (error.name === 'TokenExpiredError') {


      } else {
        console.log('error with token verification:', error);
      }
      console.log('clearing cookies');
    }
  }

  //  RETRIEVE REFRESH TOKEN FROM REQUEST COOKIES
  const refreshToken = req.cookies.refreshToken;
  if (refreshToken) {
    //  REFRESH TOKEN IS FOUND, LETS TRY VERIFYING IT (NOT USED AND IS VALID)
    try {
      //  VERIFIES REFRESH TOKEN AND STORES PAYLOAD IN VARIABLE
      const refreshTokenPayload = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
      //  LET US VERIFY THAT THIS REFRESH TOKEN HASN'T BEEN USED ALREADY.
      if (await verifyRefreshToken(refreshToken)) {
        const userId = refreshTokenPayload.userId;
        //  RETURNS ARRAY [ACCESS TOKEN, REFRESH TOKEN]
        const newTokens = await generateNewTokens(userId);
        const newAccessToken = newTokens[0];
        const newRefreshToken = newTokens[1];
        //  SETTING ACCESS/REFRESH TOKEN IN COOKIES
        res.cookie('accessToken', newAccessToken, {
          httpOnly: true,
          maxAge: 1000 * 60 * 60
        });
        res.cookie('refreshToken', newRefreshToken, {
          httpOnly: true,
          maxAge: 1000 * 60 * 60 * 24 * 30
        });
        req.userId = userId;
        return next();
      } else {
        console.log('line 68: verifyRefreshToken returned false');
      }
    } catch (error) {
      console.log('Error occurred while verifying refresh token', error);
    }
  } else {
    //  IF REFRESH TOKEN IS NOT FOUND, REDIRECT TO LOGIN PAGE
    console.log('No refresh token');
  }
  //  Authenticating access and refresh token failed
  //  Clearing cookies
  res.clearCookie('accessToken', {httpOnly: true});
  res.clearCookie('refreshToken', {httpOnly: true});
  return res.redirect('/login');
}

async function verifyRefreshToken(refreshToken) {
  //  HASH THE REFRESH TOKEN
  const hashedRefreshToken = crypto.createHash('sha256').update(refreshToken).digest('hex');
  //  SQL TO FIND REFRESH TOKEN IN DATABASE
  const retrieveRefreshTokenSQL = 'SELECT * FROM refresh_tokens WHERE refresh_token = ? AND is_used = FALSE';
  try {
    const [refreshTokenFromDB] = await mySQLConnection.query(retrieveRefreshTokenSQL, [hashedRefreshToken]);
    console.log('line 91:', refreshTokenFromDB);
    if (refreshTokenFromDB.length > 0) {
      //  SET REFRESH TOKEN AS USED IN DATABASE
      const setRefreshTokenUsedSQL = 'UPDATE refresh_tokens SET is_used = TRUE WHERE refresh_token = ?';
      try {
        console.log('line 100: updating refresh token in db', hashedRefreshToken);
        await mySQLConnection.query(setRefreshTokenUsedSQL, [hashedRefreshToken]);
        return true;
      } catch (error) {
        console.log('line 102', error);
        return false;
      }
    } else {
      console.log('line 107: refreshToken not found in db');
      return false;
    }
  } catch (error) {
    console.log('line 106', error);
    return false;
  }
}

async function generateNewTokens(userId) {
  //  GENERATE USER OBJECT TO STORE AS PAYLOAD IN TOKENS
  const userObject = {'userId': userId};
  //  GENERATE NEW ACCESS/REFRESH TOKENS
  const newAccessToken = jwt.sign(userObject, process.env.ACCESS_TOKEN_SECRET, {expiresIn: '15s'});
  const newRefreshToken = jwt.sign(userObject, process.env.REFRESH_TOKEN_SECRET);
  //  STORE NEW REFRESH TOKEN IN DATABASE
  const hashedRefreshToken = crypto.createHash('sha256').update(newRefreshToken).digest('hex');
  const insertRefreshTokenSQL = 'INSERT INTO refresh_tokens (user_id, refresh_token) ' +
      'VALUES (?, ?)';
  try {
    await mySQLConnection.query(insertRefreshTokenSQL, [userId, hashedRefreshToken]);
  } catch (error) {
    console.log('generateNewTokens, Error occurred while inserting hashed refresh token:', error);
    return [];
  }
  //  STORE IN ARRAY TO RETURN TO AUTHENTICATE TOKENS
  const newTokens = [];
  newTokens.push(newAccessToken);
  newTokens.push(newRefreshToken);
  return newTokens;
}

//  Get Routes

app.get("/", authenticateToken, (req, res) => {
  const userId = req.userId;
  const { message, border } = req.query;
  res.render("index", {message, border, userId});
});

//route to render movies by keywords using the search bar
app.get("/searchResults", authenticateToken, async (req, res) => {
  const userId = req.userId;
  const { message, border } = req.query;
  let keyword = req.query.search;
  //  Searching OMDB API
  let searchPage = 1;
  let movieSetURL = `https://www.omdbapi.com/?apikey=${apiKey}&s=${keyword}&type=movie&page=${searchPage}`;
  let movieSetResponse = await fetch(movieSetURL);
  let movieSetData = await movieSetResponse.json();
  if (movieSetData.Search) {
    const searchMovieSQL = 'SELECT * FROM movies WHERE movie_id = ?';
    let params = [movieSetData.Search.at(0).imdbID];
    try {
      let [movieRow] = await mySQLConnection.query(searchMovieSQL, params);
      console.log('line 179', movieRow);
      if (movieRow.length === 0) {
        searchPage++;
        movieSetResponse = await fetch(movieSetURL);
        movieSetData = await movieSetResponse.json();
        console.log('line 184', movieSetData.Search[0]);
        for (let movie of movieSetData.Search) {
          //  Retrieve individual movie information
          let movieUrl = `https://www.omdbapi.com/?apikey=${apiKey}&i=${movie.imdbID}`;
          let movieResponse = await fetch(movieUrl);
          let movieData = await movieResponse.json();
          let imdbRating =
           movieData.Ratings.find(
            (r) => r.Source === "Internet Movie Database"
           )?.Value || null;
          let rottenTomatoesRating =
           movieData.Ratings.find((r) => r.Source === "Rotten Tomatoes")
            ?.Value || null;
          let metacriticRating =
           movieData.Ratings.find((r) => r.Source === "Metacritic")?.Value ||
           null;
          let releaseDate;
          if (movieData.Released === "N/A") {
            releaseDate = null;
          } else {
            releaseDate = new Date(movieData.Released)
             .toISOString()
             .split("T")[0];
          }
          //  Insert movie information into database
          let insertMovieSQL =
           "INSERT INTO movies (" +
           "movie_id, title, actors, genre, runtime, age_rating, imdb_rating," +
           "rotten_tomatoes_rating, metacritic_rating, poster_url, release_date, director, " +
           "description) " +
           "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)" +
           "ON DUPLICATE KEY UPDATE " +
           "title = VALUES(title), actors = VALUES(actors), genre = VALUES(genre), " +
           "runtime = VALUES(runtime), age_rating = VALUES(age_rating), imdb_rating = VALUES(imdb_rating), " +
           "rotten_tomatoes_rating = VALUES(rotten_tomatoes_rating), metacritic_rating = VALUES(metacritic_rating), " +
           "poster_url = VALUES(poster_url), release_date = VALUES(release_date), director = VALUES(director), " +
           "description = VALUES(description);";

          await mySQLConnection.execute(insertMovieSQL, [
            movieData.imdbID,
            movieData.Title,
            movieData.Actors,
            movieData.Genre,
            movieData.Runtime,
            movieData.Rated,
            imdbRating,
            rottenTomatoesRating,
            metacriticRating,
            movieData.Poster,
            releaseDate,
            movieData.Director,
            movieData.Plot,
          ]);
        }
      }
    } catch (error) {
      console.log('Error occurred while retrieving movie from database', error);
    }
  }
  let sql = `SELECT *
              FROM movies
              WHERE title LIKE ?`;
  let sqlParams = [`%${keyword}%`];
  const [rows] = await mySQLConnection.query(sql, sqlParams);
  // console.log(rows);
  res.render("searchResults", {"searchMovies": rows, keyword, message, border, userId});
});

//route to watchlist page will render movie poster and title
//also has model to display rest of info
app.get("/watchlist", authenticateToken, async (req, res) => {
  const userId = req.userId;
  const { message, border } = req.query;
  let sql = `SELECT movie_id, poster_url, title
              FROM watchlists
              NATURAL JOIN movies 
              WHERE user_id = ?`;
  const [rows] = await mySQLConnection.query(sql, userId);
  console.log(rows);
  res.render("watchlist", {"watchlistMovies": rows, message, border, userId});
});

//route to add movies from index to watchlist
app.post("/addTowatchlist", authenticateToken, async function(req, res) {
  const userId = req.userId;
  let movie_id = req.body.btnAddWatchlist;
  let sqlCheck = `SELECT *
                  FROM watchlists
                  WHERE movie_id = ? AND user_id = ?`;
  let checkParams = [movie_id, userId];
  const[rowsCheck] = await mySQLConnection.query(sqlCheck, checkParams);
  console.log(rowsCheck);
  if(rowsCheck.length > 0){
    res.render("index", {"message": "Movie Already In Watchlist!"})
  }else{
    let sql = `INSERT INTO watchlists 
              (user_id, movie_id)
              VALUES (?, ?)`; 
    let params = [userId, movie_id];
    const [rows] = await mySQLConnection.query(sql, params);
    res.render("index", {"message": "Movie Added To Watchlist!"})
  }
});

//route to favorites page will render movie poster and title
//also has model to display rest of info
app.get("/favorites", authenticateToken, async(req, res) => {
  const userId = req.userId;
  const { message, border } = req.query;
  let sql = `SELECT movie_id, poster_url, title
              FROM favorites
              NATURAL JOIN movies 
              WHERE user_id = ?`;
  const [rows] = await mySQLConnection.query(sql, userId);
  res.render("favorites", {"favMovies": rows, message, border, userId});
});

//route to add movies to favorites from index
app.post("/addToFavorites", authenticateToken, async function(req, res) {
  const userId = req.userId;
  let movie_id = req.body.btnAddFavorite;
  let sqlCheck = `SELECT *
                  FROM favorites
                  WHERE movie_id = ? AND user_id = ?`;
  let checkParams = [userId, movie_id];
  const [rowsCheck] = await mySQLConnection.query(sqlCheck, checkParams);
  console.log(rowsCheck);
  if(rowsCheck.length > 0){
    res.render("index", {"message": "Movie Already In Favorites!"});
  }else{
    let sql = `INSERT INTO favorites 
              (user_id, movie_id)
              VALUES (?, ?)`;  
    let params = [userId, movie_id];
    const [rows] = await mySQLConnection.query(sql, params);
    res.render("index", {"message": "Movie Added To Favorites!"});
  }
});

// Edit Movie
app.get("/movie/edit", authenticateToken, async function (req, res) {
  const userId = req.userId;
  const { message, border } = req.query;
  let movieId = req.query.movieId; 

  let sql = `SELECT * FROM movies WHERE movie_id = ?`;
  const [movieRows] = await mySQLConnection.query(sql, [movieId]);

  
  if (movieRows.length > 0) {
      res.render("updateMovies", {
          movieInfo: movieRows[0], message, border, userId
      });
  } else {
      res.status(404).send("Movie not found");
  }
});

app.post("/movie/edit", authenticateToken, async function (req, res) {
  const userId = req.userId;
  const { message, border } = req.query;
  let sql = `
      UPDATE movies
      SET title = ?, description = ?, genre = ?, release_date = ?, director = ?, user_rating = ?
      WHERE movie_id = ?
  `;

  let params = [
      req.body.title,
      req.body.description,
      req.body.genre,
      req.body.release_date,
      req.body.director, 
      req.body.user_rating,
      req.body.movie_id
  ];

  const [rows] = await mySQLConnection.query(sql, params);

  const fetchMoviesSql = `SELECT * FROM movies`;
  const [movies] = await mySQLConnection.query(fetchMoviesSql);

  res.render("index", {
    message: "Movie successfully updated!", message, border, userId
  });

});

//  Login routes
app.get('/login', (req, res) => {
  const accessToken = req.cookies.accessToken;
  if (accessToken) {
    res.redirect('/');
  } else {
    const { message, border } = req.query;
    res.render('login', {message, border});
  }
});

app.post('/login', async (req, res) => {
  const username = req.body.username;
  const password = req.body.password;
  const findUserSQL = 'SELECT * FROM users WHERE username = ?';
  try {
    const [userRow] = await mySQLConnection.query(findUserSQL, [username]);
    const user = userRow[0];
    const hashedPassword = user.hashed_password;
    const match = await bcrypt.compare(password, hashedPassword);
    if (match) {
      const userId = user.user_id;
      const userObject = {'userId': userId};
      const accessToken = jwt.sign(userObject, process.env.ACCESS_TOKEN_SECRET, {expiresIn: '1h'});
      const refreshToken = jwt.sign(userObject, process.env.REFRESH_TOKEN_SECRET, {expiresIn: '30d'});
      const hashedRefreshToken = crypto.createHash('sha256').update(refreshToken).digest('hex');
      const insertRefreshTokenSQL = 'INSERT INTO refresh_tokens (user_id, refresh_token) ' +
          'VALUES (?, ?)';
      try {
        await mySQLConnection.query(insertRefreshTokenSQL, [userId, hashedRefreshToken]);
      } catch (error) {
        console.log('Error occurred while inserting refresh token to database', error);
        return res.redirect(`/login?message=${error}&border=text-bg-warning`);
      }
      res.cookie('accessToken', accessToken, {
        httpOnly: true,
        maxAge: 1000 * 60 * 60
      });
      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24 * 30
      });
      return res.redirect('/?message=Login successful&border=text-bg-success');
    } else {
      return res.redirect('/login?message=Incorrect password&border=text-bg-danger');
    }
  } catch (error) {
    console.log('Error occurred while retrieving user from database', error);
    return res.redirect(`/login?message=Incorrect username&border=text-bg-warning`);
  }
});

app.get('/logout', (req, res) => {
  console.log('clearing cookies');
  //  CLEARING COOKIES
  res.clearCookie('accessToken', {httpOnly: true});
  res.clearCookie('refreshToken', {httpOnly: true});
  res.redirect('/login');
});

app.get('/register', (req, res) => {
  const { message, border } = req.query;
  res.render('register', {message, border});
});

app.post('/register', async (req, res) => {
  const username = req.body.username;
  const password = req.body.password;
  const confirmedPassword = req.body.confirmPassword;
  console.log(password, confirmedPassword);
  if (password === confirmedPassword) {
    console.log('passwords match');
    //  Hash password: prepare for insertion into database
    const hashedPassword = await bcrypt.hash(password, 10);
    //  Set up insert sql statement and parameters
    const insertUserSQL = 'INSERT INTO users (username, hashed_password) VALUES (?, ?)';
    const params = [username, hashedPassword];
    try {
      await mySQLConnection.query(insertUserSQL, params);
      return res.redirect('/login?message=Registration successful&border=text-bg-success');
    } catch (error) {
      console.log('Error occurred while inserting user to database', error);
      return res.redirect(`/register?message=${error}&border=text-bg-danger`);
    }
  } else {
    return res.redirect('/register?message=Passwords do not match&border=text-bg-warning');
  }
});

//  Retrieves movies from API and stores in database
app.get("/movies", async (req, res) => {
  //  Offset tells us which row to start grabbing items from
  let offset = parseInt(req.query.offset) || 0;
  //  Limits us to grabbing 10 rows at a time from database
  let limit = parseInt(req.query.limit) || 10;

  let movieSearchSQL = "SELECT * FROM movies LIMIT ? OFFSET ?";
  let moviesResult = await mySQLConnection.query(movieSearchSQL, [
    limit,
    offset,
  ]);
  let movieRows = moviesResult[0];

  if (movieRows.length === 0) {
    while (movieRows.length === 0) {
    //  console.log("Page:", page);
      // console.log("No movies found in jmondrag_movies");
      //  Retrieve first set of movies from API
      let movieSetUrl = `https://www.omdbapi.com/?apikey=${apiKey}&s=Superman&type=movie&page=${page}`;
      let movieSetResponse = await fetch(movieSetUrl);
      let movieSetData = await movieSetResponse.json();

      if (movieSetData.Search) {
        let count = 1;
        for (let movie of movieSetData.Search) {
        //  console.log("movie:", count);
          //  Retrieve individual movie information
          let movieUrl = `https://www.omdbapi.com/?apikey=${apiKey}&i=${movie.imdbID}`;
          let movieResponse = await fetch(movieUrl);
          let movieData = await movieResponse.json();

          let imdbRating =
            movieData.Ratings.find(
              (r) => r.Source === "Internet Movie Database"
            )?.Value || "Rating not available.";
          let rottenTomatoesRating =
            movieData.Ratings.find((r) => r.Source === "Rotten Tomatoes")
              ?.Value || "Rating not available.";
          let metacriticRating =
            movieData.Ratings.find((r) => r.Source === "Metacritic")?.Value ||
            "Rating not available.";
         // console.log(movieData.Title, movieData.Released);
          let releaseDate;
          if (movieData.Released === "N/A") {
            releaseDate = null;
          } else {
            releaseDate = new Date(movieData.Released)
              .toISOString()
              .split("T")[0];
          }

          //  Insert movie information into database
          let insertMovieSQL =
            "INSERT INTO movies (" +
            "movie_id, title, actors, genre, runtime, age_rating, imdb_rating," +
            "rotten_tomatoes_rating, metacritic_rating, poster_url, release_date, director, " +
            "description) " +
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)" +
            "ON DUPLICATE KEY UPDATE " +
            "title = VALUES(title), actors = VALUES(actors), genre = VALUES(genre), " +
            "runtime = VALUES(runtime), age_rating = VALUES(age_rating), imdb_rating = VALUES(imdb_rating), " +
            "rotten_tomatoes_rating = VALUES(rotten_tomatoes_rating), metacritic_rating = VALUES(metacritic_rating), " +
            "poster_url = VALUES(poster_url), release_date = VALUES(release_date), director = VALUES(director), " +
            "description = VALUES(description);";
      
          await mySQLConnection.execute(insertMovieSQL, [
            movieData.imdbID,
            movieData.Title,
            movieData.Actors,
            movieData.Genre,
            movieData.Runtime,
            movieData.Rated,
            imdbRating,
            rottenTomatoesRating,
            metacriticRating,
            movieData.Poster,
            releaseDate,
            movieData.Director,
            movieData.Plot,
          ]);
          count++;
        }
      } else {
        console.log("No more movies available in API");
        break;
      }
      page++;

      //  Retry search from database now that it is populated.
      moviesResult = await mySQLConnection.query(movieSearchSQL, [
        limit,
        offset,     
      ]);
      movieRows = moviesResult[0];
    }
  }
  res.json(movieRows);
});

//local api to display movie info on modal
//sending data in JSON format
app.get('/api/movies/:id', async (req, res) => {
  let movieId = req.params.id;
  let sql = `SELECT *
            FROM movies
            WHERE movie_id = ?`;           
  let [rows] = await mySQLConnection.query(sql, [movieId]);
  res.send(rows)
  
});

app.get('/api/comments/:id', async(req, res) => {
  let movie_id = req.params.id;
  let sql = `SELECT title, username, comment
              FROM  comments
              NATURAL JOIN movies as m 
              WHERE movie_id = ?`;
  const [rows] = await mySQLConnection.query(sql, movie_id);
  console.log(rows);
  res.send(rows);
});

app.get('/addComment', authenticateToken, async (req, res) => {
  let movie_id = req.query.movie_id;
  const userId = req.userId;
  let sql = `SELECT username
              FROM users
              WHERE user_id = ?`;
  const [row] = await mySQLConnection.query(sql, userId);
  console.log(row);
  let sql2 = `SELECT title, poster_url, movie_id
              FROM movies
              WHERE movie_id = ?`
  const [row2] = await mySQLConnection.query(sql2, movie_id);
  console.log(row2);
  res.render("addComment", {"userInfoRow": row, "movieInfoRow": row2});
});

app.post('/addComment', authenticateToken, async (req, res)=>{
  let movie_id = req.body.movie_id;
  const userId = req.userId;
  let sql = `SELECT username
              FROM users
              WHERE user_id = ?`;
  const [row] = await mySQLConnection.query(sql, userId);
  console.log(row);
  let sql2 = `SELECT title, poster_url, movie_id
              FROM movies
              WHERE movie_id = ?`;
  const [row2] = await mySQLConnection.query(sql2, movie_id);
  let username = req.body.username;
  let newComment = req.body.newComment;
  let sql3 = `INSERT INTO comments
              (movie_id, username, comment)
              VALUES(?, ?, ?)`;
  let params = [movie_id, username, newComment];
  const [commentRows] = await mySQLConnection.query(sql3, params);
  console.log(commentRows);
  res.render("addComment", {"userInfoRow": row, "movieInfoRow": row2, "message": "Comment Added!"});
})

app.listen(3000, () => {
  console.log("server started");
});
