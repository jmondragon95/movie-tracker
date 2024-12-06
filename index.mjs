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

app.get("/", (req, res) => {
  res.render("index");
});

app.get("/trending", (req, res) => {
  res.render("trending");
});

app.get("/watchlist", (req, res) => {
  res.render("watchlist");
});

app.get("/favorites", (req, res) => {
  res.render("favorites");
});

//  LOGIN ROUTES

app.get('/login', (req, res) => {
  const accessToken = req.cookies.accessToken;
  if (accessToken) {
    res.redirect('/welcome');
  } else {
    const { message, border } = req.query;
    res.render('login', {message, border});
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
      console.log("Page:", page);
      // console.log("No movies found in jmondrag_movies");
      //  Retrieve first set of movies from API
      let movieSetUrl = `https://www.omdbapi.com/?apikey=${apiKey}&s=Batman&type=movie&page=${page}`;
      let movieSetResponse = await fetch(movieSetUrl);
      let movieSetData = await movieSetResponse.json();

      if (movieSetData.Search) {
        let count = 1;
        for (let movie of movieSetData.Search) {
          console.log("movie:", count);
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
          console.log(movieData.Title, movieData.Released);
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
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);";

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
      let moviesResult = await mySQLConnection.query(movieSearchSQL, [
        lastMovieID,
        limit,
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

app.listen(3000, () => {
  console.log("server started");
});
