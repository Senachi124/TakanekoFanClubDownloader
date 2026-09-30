# Takaneko maintenance

- Root documentation and packaging serve public desktop users and local development.
- Keep app identity and existing userData stable. Version comes from package.json.
- Preserve built-in Fanclub login and token capture. Never print credentials or archive content in reports.
- UI languages: Traditional Chinese and Japanese, with a machine translation notice. Display times in Asia/Hong_Kong, 24-hour format; preserve source metadata and immutable paths.
- Public source and packages must not contain host-specific domains, NAS locations, credentials, inventories or personal archives. Maintainer notes belong outside Git.
- Server instructions are in server/AGENTS.md and server/README.md.
- Reader source stays under server/local-reader but runs locally without server services. Archives are read-only; indexes belong in userData.
- Run npm test and npm run check:release. Server changes also require the isolated Python suite and applicable deployment checks.
