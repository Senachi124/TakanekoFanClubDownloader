const { getJson } = require('./client');
const { MANAGER_BLOG_CATEGORY } = require('./config');

const list = (token, page = 1) => getJson(`/blog/queries/getArticleList?blogId=topics&page=${encodeURIComponent(page)}&categories=${MANAGER_BLOG_CATEGORY}`, token);
const detail = (token, id) => getJson(`/blog/queries/getArticleDetail/${encodeURIComponent(id)}`, token);

module.exports = { list, detail };
