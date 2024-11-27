//  Event Listeners

window.addEventListener("scroll", () => {
  if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 200) {
    fetchMovies();
  }
});

// Global Variables

let offset = parseInt(localStorage.getItem("offset")) || 0;
const limit = 10;
let loading = false;
const moviesContainer = document.getElementById("movies-container");

const storedMovies = JSON.parse(localStorage.getItem("movies")) || [];

if (storedMovies.length > 0) {
  renderMovies(storedMovies);
} else {
  fetchMovies();
}

//  Functions

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
      renderMovies(movies);
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
  movies.forEach((movie) => {
    const movieCard = document.createElement("div");
    movieCard.className = "card text-bg-secondary";
    if (movie.poster_url === "N/A") {
      movieCard.innerHTML = `<img src="img/placeholder.png" alt="${movie.title}">`;
    } else {
      movieCard.innerHTML = `<img src="${movie.poster_url}" alt="${movie.title}">`;
    }
    if (movie.description === "N/A") {
      movieCard.innerHTML += `<div class="card-body">
                  <h3 class="card-title">${movie.title}</h3>
                  <p class="card-text">Description unavailable</p>
                                  </div>`;
    } else {
      movieCard.innerHTML += `<div class="card-body">
                <h3 class="card-title">${movie.title}</h3>
                <p class="card-text">${movie.description}</p>
            </div>`;
    }
    moviesContainer.appendChild(movieCard);
  });
}
