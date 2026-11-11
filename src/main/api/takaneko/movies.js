const { getJson } = require('./client');
const { OFFICIAL_MEDIA_HEADERS } = require('./config');

const list = (token, page = 1) => getJson(`/movie/queries/getMovieList?page=${encodeURIComponent(page)}&pageSize=20`, token, { headers: OFFICIAL_MEDIA_HEADERS });
const detail = (token, id) => getJson(`/movie/queries/getMovieDetail/${encodeURIComponent(id)}`, token, { headers: OFFICIAL_MEDIA_HEADERS });

module.exports = { list, detail };
