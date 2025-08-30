DJs at the radio station KEXP in Seattle will sometimes play the same song
back-to-back if they really like it.
We're going to write a backend to find those "double plays".

KEXP provides an API, which you can find described here: https://api.kexp.org/v2/.
Use the v2 API to retrieve information about what songs were played when.

A song is a double play if it appears multiple times in a row, possibly separated by air breaks.
Use the API to discover double plays and save them to a file.
For each double play, record all relevant information: information about the
track (artist and title), timestamps for every play of the song in the double
play, the same of the DJ and show.
Save the data to a JSON file at a configurable location.
There shouldn't be too many double plays, so this is a reasonable approach to
data persistence.

Implement the backend as a single Typescript script.
Maintain both a start time and end time, with the start time the earliest we've
looked for double plays and the end time the latest.
On startup, begin at the end time and scan forward.
Then, begin at the start time and scan backward.
Even few minutes, advance the start time forward, to ensure you're keeping the
JSON file updated with the latest double plays.

I'd suggest retrieving hour intervals at most.
Use configurable rate limiting to avoid overwhelming the API.
Make sure you keep the JSON start and end times updated so you don't scan the
same interval.

Write tests for the project.
To test whether you can properly detect a double play, the song Pulp by Spike
Island was double played on 4/10/2025 at around 10:08AM Central Time.

Initialize a Git repository and commit your work regularly.
Commit after every incremental change, and definitely every time you complete
one of your TODOs.
Write descriptive commit messages.
