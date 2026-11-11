// Compatibility entry point; Fanclub endpoints live in ./takaneko.
const { notifications } = require('./takaneko');

async function handleGetAllPosts(token) {
  return notifications.listAll(token);
}

module.exports = { handleGetAllPosts };
