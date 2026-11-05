// "alpha (day N, build M)" for whoever plays it (CHUNKY-184), which the deploy puts up as build.json beside version.txt: how many
// commits a build is, and which day of building it's from. Days are as the calendar has them in Mississippi, with the day main's first
// commit went in as day 1, and a commit's day is the day it went in, so the same commit says the same however often it's put up.

// a moment's date in Mississippi, as a whole number of days
function dateOf(iso) {
  const part = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: 'numeric', day: 'numeric' })
    .formatToParts(new Date(iso)).map(({ type, value }) => [type, +value]));
  return Date.UTC(part.year, part.month - 1, part.day) / 86400000;
}
export const dayOf = (first, at) => dateOf(at) - dateOf(first) + 1;
// what build.json says
export const stampOf = ({ sha, build, at, first }) => ({ commit: sha, build, day: dayOf(first, at) });
