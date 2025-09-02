Create a web frontend display the data from the backend server.
It should be running at https://api.kexpdoubleplays.org/.
Borrow styles from https://kexp.org/, including fonts, colors, and so on.
Keep this very simple.
It should be a static page.
Serve it with Node and implement the page build with Typescript and create a
React SPA, but it's probably unnecessary to use a heavy framework like NextJS.
I'd suggest Tailwind for CSS, but feel free to use whatever you think is
appropriate.

Initially please provide a very minimal single-page UI.
Just display the full list of double plays.
Use the same item display as the KEXP playlist: https://kexp.org/playlist.
Except, move the cover to the right, and have it displayed _twice_, since this
is, after all, a double play.

One thing to keep in mind is that, eventually, we'll want to add YouTube links
to the double plays.
I assume that the YouTube API may be slow, and not something to access on the
page load path.
This will mean that the page will need to be able to be updated in the
background, without interrupting serving the current page.
Whatever framework you use please account for this design requirement.
