# ember-cli-deploy-simply-ssh #

**Install**

!!!For some reason it opens a new session for every file uploaded (implementation of ssh2 or node-ssh), so it requires `MaxSessions XXX` in sshd config where XXX is something big.

```
$ ember install ember-cli-deploy
$ ember install ember-cli-build
$ ember install ember-cli-revision-data
$ ember install ember-cli-deploy-gzip
$ ember install ember-cli-deploy-simply-ssh
```

Sample `deploy.js`:

```js
module.exports = function(deployTarget) {
  var ENV = {};

  if (deployTarget === 'production') {
    ENV.build = {
      environment: 'production'
    }
    
    ENV.ssh = {
      host: process.env.SSH_HOST,
      dir: process.env.SSH_DIR,
      port: process.env.SSH_PORT,
      user: process.env.SSH_USER,
      key: process.env.SSH_KEY
    }
  }

  return ENV;
};

```

Sample `.env.deploy.production`:
```
SSH_HOST=yourhost.com
SSH_DIR=/var/www/appdir
SSH_PORT=22
SSH_USER=deploy
SSH_KEY=/home/user/.ssh/id_rsa
```
* Also possible to use password and passphrase as params.

## Directory Structure ##

Application releases live in `releases` dir:
```
/var/www/appdir/releases/35h23jh23j52k3jg5k32jh5
/var/www/appdir/releases/2lkjs9d93ukhf3798oasjf7
```
Current release linked to `/var/www/appdir/current`
index.html and assets copied together to be served by Nginx.