# ember-cli-deploy-simply-ssh #

This plugin implements the most basic deploy strategy — deploying using ssh/sftp
onto remote server.   

##Installation##

```
$ ember install ember-cli-deploy
$ ember install ember-cli-build
$ ember install ember-cli-revision-data
$ ember install ember-cli-deploy-gzip
$ ember install ember-cli-deploy-simply-ssh
```

Where `ember-cli-revision-data` and `ember-cli-deploy-gzip` are optional.

##Setup##

Sample `deploy.js`:

```js
module.exports = function(deployTarget) {
  var ENV = {};

  if (deployTarget === 'production') {
    ENV['build'] = {
      environment: 'production'
    }

    ENV['simply-ssh'] = {
      connection: {
        // parameter hash accepted by SSH2, see https://github.com/mscdex/ssh2 for details
        host: process.env.SSH_HOST,
        port: process.env.SSH_PORT,
        username: process.env.SSH_USER,
        privateKey: process.env.SSH_KEY
      },
      dir: '/var/www/app',
      keep: 5
    }
  }

  return ENV;
};

```

Sample `.env.deploy.production`:
```
SSH_HOST=yourhost.com
SSH_PORT=22
SSH_USER=deploy
SSH_KEY=/home/user/.ssh/id_rsa
```
* Also possible to use password and passphrase as params.

It makes sense to add `.env.deploy.*` to your `.gitignore` file.

## Usage ##

### With `ember-cli-revision-data`

Application releases are placed in `(dir)/releases` folder using revision key:
```
/var/www/app/releases/35h23jh23j52k3jg5k32jh5
/var/www/app/releases/2lkjs9d93ukhf3798oasjf7
```

To become active, the revision must be activated, which creates a symbolic link
`/var/www/app/current` linked to the active revision.

You can choose to activate the release right after deployment:
`ember deploy production --activate`

...or activate it afterwards:
```
ember deploy production
ember deploy:activate production --revision 35h23jh23j52k3jg5k32jh5
```

To list available releases, use: `ember deploy:list production`
```
- =================================
- > 2017/08/26 13:52:53 | 35h23jh23j52k3jg5k32jh5
-   2017/09/08 16:43:16 | 2lkjs9d93ukhf3798oasjf7
```

Option `keep` defines how many of the most recent revisions will be kept on server.
Active release cannot be deleted, which makes it outstanding. For example, if
you have `keep == 3` and your active release is older than 3 most recent releases,
then total number of available releases will be 4.

### Without `ember-cli-revision-data`

Without revision data plugin all files are placed into `dir` folder as is,
in which case you don't need to activate the release, and you won't have
the list of available releases.
