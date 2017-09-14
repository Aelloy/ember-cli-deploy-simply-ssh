# ember-cli-deploy-simply-ssh #

This plugin implements the most basic deploy strategy: deploying through ssh/sftp
onto a remote server.

## Installation ##

```
$ ember install ember-cli-deploy
$ ember install ember-cli-deploy-build
$ ember install ember-cli-deploy-revision-data
$ ember install ember-cli-deploy-gzip
$ ember install ember-cli-deploy-simply-ssh
```

Notice that `ember-cli-deploy-revision-data` and `ember-cli-deploy-gzip` are optional.

## Setup ##

Example of `deploy.js`:

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

Example of `.env.deploy.production`:
```
SSH_HOST=yourhost.com
SSH_PORT=22
SSH_USER=deploy
SSH_KEY=/home/user/.ssh/id_rsa
```
* You can also use `password`, `passphrase`, and any other [params supported by SSH2](https://github.com/mscdex/ssh2#client-methods).

It makes sense to add `.env.deploy.*` to your `.gitignore` file.

## Usage ##

### With `ember-cli-deploy-revision-data` ###

Application releases are placed into `(dir)/releases` folder using revision keys:
```
/var/www/app/releases/35h23jh23j52k3jg5k32jh5
/var/www/app/releases/2lkjs9d93ukhf3798oasjf7
```

The information about deployed revisions is stored in `/var/www/app/releases/revisions.json`.
It can become out of sync, in this case you will need to delete unaccounted revisions on the server manually.

To make a revision active, you must activate it; the activation creates a symbolic link
`/var/www/app/current` pointing to the active revision.

You can choose to activate the release right after deployment:
`ember deploy production --activate`

You can also activate it afterwards:
```
ember deploy production
ember deploy:activate production --revision 35h23jh23j52k3jg5k32jh5
```

To list the available releases, use: `ember deploy:list production`
```
- =================================
- > 2017/08/26 13:52:53 | 35h23jh23j52k3jg5k32jh5
-   2017/09/08 16:43:16 | 2lkjs9d93ukhf3798oasjf7
```

The `keep` option defines how many of the most recent revisions will be kept on server.
The active release cannot be deleted so it is excluded from the count. For example, if
you have `keep == 3` and your active release is older than 3 most recent releases,
then total number of available releases will be 4.

### Without `ember-cli-deploy-revision-data` ###

Without the revision data plugin, all files are placed into `dir` folder as is;
in this case you don't need to activate the release, and you won't have
the list of available releases.

### GZipping ###

Whether you use `ember-cli-deploy-gzip` or not, this plugin will copy appropriate
files into the defined directory.

* P.S. If you use it on a Windows machine or with a Windows-driven web server, please
provide a feedback if you have any issues. To support these combinations, we might
need some extra options.
