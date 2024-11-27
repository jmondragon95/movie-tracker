import express from "express";
const app = express();
app.set("view engine", "ejs");
app.use(express.static("public"));

app.get("/", (req, res) => {
  res.render("index");
});

app.get("/watchlist", (req, res) => {
  res.render("watchlist");
});

app.get("/favorites", (req, res) => {
  res.render("favorites");
});

app.listen(3000, () => {
  console.log("server started");
});
