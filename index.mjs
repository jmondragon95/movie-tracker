//  Imports
import express from "express";
import mysql from "mysql2/promise";

//  Global Variables
const app = express();
const pool = mysql.createPool({
  host: "jmondragon.tech",
  user: "jmondrag_movieWatcher",
  password: "CSUMB-cst336@",
  database: "jmondrag_movies",
  connectionLimit: 10,
  waitForConnections: true,
});
const mySQLConnection = await pool.getConnection();
let apiKey = "683b5907";
let page = 1;

//  Setup view engine and public (static) directory
app.set("view engine", "ejs");
app.use(express.static("public"));

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

app.listen(3000, () => {
  console.log("server started");
});
