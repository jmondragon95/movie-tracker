
//  BOOTSTRAP VALIDATION FUNCTION

(() => {
  'use strict'

  // Fetch all the forms we want to apply custom Bootstrap validation styles to
  const forms = document.querySelectorAll('.needs-validation')

  // Loop over them and prevent submission
  Array.from(forms).forEach(form => {
    form.addEventListener('submit', event => {
      if (!form.checkValidity()) {
        event.preventDefault()
        event.stopPropagation()
      }

      form.classList.add('was-validated')
    }, false)
  })
})()

//  Event Listeners

window.addEventListener("scroll", () => {
  if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 200) {
    fetchMovies();
  }
});

document.addEventListener('DOMContentLoaded', showToast);
//adde event listener for watchlist and favorites
addMovieEventListeners();

// Global Variables

let offset = parseInt(localStorage.getItem("offset")) || 0;
const limit = 10;
let loading = false;
const moviesContainer = document.getElementById("movies-container");

const storedMovies = JSON.parse(localStorage.getItem("movies")) || [];

if (storedMovies.length > 0 && moviesContainer) {
  renderMovies(storedMovies);
} else {
  fetchMovies();
}

//  Functions

function showToast() {
  const toastElement = document.getElementById('toastMessage');
  //  If toast element is found on page, continue
  if (toastElement) {
    const toastMessageElement = document.getElementById('toastMessage');
    //  If toast message has text inside, show it
    if (toastMessageElement.textContent.trim() !== '') {
      const toastBootstrap = bootstrap.Toast.getOrCreateInstance(toastElement);
      toastBootstrap.show();
    }
  }
}

async function fetchMovies() {
  //  If we are loading, cancel this extra fetch function
  if (loading) return;
  //  Set loading to true to ensure only one fetch occurs at a time
  loading = true;
  //  Retrieve movies from database
  try {
    const response = await fetch(`/movies?offset=${offset}&limit=${limit}`);
    const movies = await response.json();
    //  If movies has items inside it, render those movies
    if (movies.length > 0) {
      //  Update offset and store locally
      offset += movies.length;
      localStorage.setItem("offset", offset);

      //  Merge new movies with stored ones and save to local storage
      const updatedMovies = [...storedMovies, ...movies];
      localStorage.setItem("movies", JSON.stringify(updatedMovies));
      //  Render new movies
      if (moviesContainer) {
        renderMovies(movies);
      }
    } else {
      console.log("No more movies available.");
    }
  } catch (error) {
    console.error("Error fetching movies:", error);
  } finally {
    loading = false;
  }
}

function renderMovies(movies) {

  //render movies
  movies.forEach((movie) => {
    const movieCard = document.createElement("div");
    movieCard.className = "card text-bg-secondary";
    if (movie.poster_url === "N/A") {
      movieCard.innerHTML = `<img src="img/placeholder.png" alt="${movie.title}">`;
    } else {
      movieCard.innerHTML = `<img src="${movie.poster_url}" alt="${movie.title}">`;
    }

   //make movie titles clickable
    movieCard.innerHTML += `<a href="#" class="movieAnchor" id="${movie.movie_id}">${movie.title}</a>`;
    moviesContainer.appendChild(movieCard);

  });
  //add event listener everytime new movies are rendered.
  addMovieEventListeners();
}

// Event listener function to add to the movie anchors
function addMovieEventListeners(){

  const movieInfoLinks = document.querySelectorAll(".movieAnchor");
  for (let movieInfoLink of movieInfoLinks) {
    movieInfoLink.addEventListener("click", getMovieInfo);
  }
}


//function to display movie info on modal
async function getMovieInfo() { 
  console.log(this.id);
  var myModal = new bootstrap.Modal(document.getElementById('movieModal'));
  myModal.show();
  let url = `/api/movies/${this.id}`;
  let response = await fetch(url);
  let data = await response.json();
  console.log(data);

  //convert date
  const releasedOn = new Date(data[0].release_date);

  //display api data for movie modal
  let movieInfo = document.querySelector("#movieInfo");
  movieInfo.innerHTML = `<h1> ${data[0].title}</h1>`;
  movieInfo.innerHTML += `<img src="${data[0].poster_url}" alt="${data[0].poster_url}" width="auto"><br><br>`;
  movieInfo.innerHTML += `<div><strong>Rated: </strong>${data[0].age_rating} </div>`;
  movieInfo.innerHTML += `<div><strong>Actors: </strong>${data[0].actors} </div>`;
  movieInfo.innerHTML += `<div><strong>Runtime: </strong>${data[0].runtime} </div>`;
  movieInfo.innerHTML += `<div><strong>Released Date: </strong>${releasedOn.toLocaleDateString()} </div>`;
  movieInfo.innerHTML += `<div><strong>Director: </strong>${data[0].director} </div>`;
  movieInfo.innerHTML += `<div><strong>Description: </strong>${data[0].description} </div>`;
  movieInfo.innerHTML += `<div><strong>IMDb-Rating: </strong>${data[0].imdb_rating} </div>`;
  movieInfo.innerHTML += `<div><strong>Rotten-Tomatoes-Rating: </strong>${data[0].rotten_tomatoes_rating} </div>`;
  let modalFooter = document.querySelector(".modal-footer");
  modalFooter.innerHTML = `<form method="POST" action="/rateMovie">
                              <button type="submit" name="btnRateMovie"  id="btnRateMovie" value="${data[0].movie_id}" >Rate</button>
                              </form>`;
  modalFooter.innerHTML +=`<form method="POST" action="/addToWatchlist">
                              <button type="submit" name="btnAddWatchlist" id="btnAddWatchList" value="${data[0].movie_id}" >Add to Watchlist</button>
                              </form>`;
  modalFooter.innerHTML +=`<form method="POST" action="/addToFavorites">
                            <button type="submit" name="btnAddFavorite" id="btnAddFavorite" value="${data[0].movie_id}" >Add to Favorites</button>
                            </form>`;
}

