const { getJson } = require('./client');
const { OFFICIAL_MEDIA_HEADERS } = require('./config');

const list = (token, page = 1) => getJson(`/gallery/queries/getGalleryAlbumList?page=${encodeURIComponent(page)}&pageSize=20`, token, { headers: OFFICIAL_MEDIA_HEADERS });
const detail = (token, id) => getJson(`/gallery/queries/getGalleryAlbumDetail/${encodeURIComponent(id)}`, token, { headers: OFFICIAL_MEDIA_HEADERS });

module.exports = { list, detail };
