/* jshint node: true */
'use strict';
const RSVP = require('rsvp');
const BasePlugin = require('ember-cli-deploy-plugin');
const node_ssh = require('node-ssh');
const path = require('path');

module.exports = {
  name: 'ember-cli-deploy-simply-ssh',

  createDeployPlugin(options) {
    const DeployPlugin = BasePlugin.extend({
      name: options.name,

      defaultConfig: {
        dir: '/var/www',
        releasesDir: 'releases',
        targetLink: 'current',
        keep: 2
      },

      setup() {
        const ssh = this.readConfig('sshClient') || new node_ssh;
        return ssh.connect(this.readConfig('connection')).then((conn) => {
          this.log("SSH connection established.", {color: "green"});
          return {ssh: conn};
        });
      },

      fetchRevisions(context) {
        return this._fetchRevisionsJson(context).then((revisions) => {
          return {revisions: revisions};
        });
      },

      willUpload(context) {
        let dir = this.readConfig('dir');
        let releasesDir = this.readConfig('releasesDir');
        if (context.revisionData && context.revisionData.revisionKey) {
          dir = path.posix.join(dir, releasesDir, context.revisionData.revisionKey);
        };
        this.log("Creating directory " + dir, {color: "green"});
        return this._execCommand(context, 'mkdir -p ' + dir).then(() => {
          return {releaseDir: dir};
        });
      },

      upload(context) {
        this.log("Uploading files:", {color: "green"});
        const files = context.distFiles;
        const distDir = path.join(process.cwd(), context.distDir);
        return files.reduce((promise, file) => {
          return promise.then(() => {
            const local = path.join(distDir, file);
            const remote = path.posix.join(context.releaseDir, file);
            return context.ssh.putFile(local, remote).then(() => {
              this.log(file);
            });
          });
        }, RSVP.Promise.resolve()).then(() => {
          if (context.revisionData && context.revisionData.revisionKey) {
            return {
              uploadedRevision: {
                revision: context.revisionData.revisionKey,
                timestamp: Date.now(),
                active: false
              }
            }
          };
        });
      },

      didUpload(context) {
        if (!context.uploadedRevision) { return RSVP.resolve() };
        return this._fetchRevisionsJson(context).then((revisions) => {
          revisions = this._mergeRevision(revisions, context.uploadedRevision);
          const split = this._splitRevisions(revisions, this.readConfig('keep'));
          const del = split[0];
          const keep = split[1];
          let promises = [];
          if (del.length > 0) { promises.push(this._deleteRevisions(context, del)) };
          if (keep.length > 0) { promises.push(this._saveRevisions(context, keep)) };
          return RSVP.all(promises);
        });
      },

      activate(context) {
        if (!(context.commandOptions.revision || context.uploadedRevision)) {
          return RSVP.resolve();
        };
        const revision = context.commandOptions.revision || context.revisionData.revisionKey;
        const source = path.posix.join(this.readConfig('dir'), this.readConfig('releasesDir'), revision);
        const target = path.posix.join(this.readConfig('dir'), this.readConfig('targetLink'));
        const cmd = "test -e " + source
          + " && ln -sfn " + source + " " + target
          + " || >&2 echo \"Revision is missing!\"";
        return this._execCommand(context, cmd).then(() => {
          this.log("Revision " + revision + " is now active!", {color: 'green'});
          return {activatedRevision: revision};
        });
      },

      didActivate(context) {
        if (!context.activatedRevision) {
          return RSVP.resolve();
        };
        const revisions = context.revisions.map((r) => {
          r.active = r.revision == context.activatedRevision;
          return r;
        });
        return this._saveRevisions(context, revisions);
      },

      teardown(context) {
        context.ssh.dispose();
        this.log("SSH connection closed", {color: 'green'});
      },

      _execCommand(context, command){
        return new RSVP.Promise((resolve, reject) => {
          context.ssh.execCommand(command, {stream: 'both'}).then((result) => {
            if (result.stderr) {
              reject(result.stderr);
            };
            resolve(result.stdout);
          });
        });
      },

      _fetchRevisionsJson(context) {
        const revPath = path.posix.join(this.readConfig('dir'), this.readConfig('releasesDir'), 'revisions.json');
        const cmd = `(test -e ${revPath} && cat ${revPath}) || echo "[]"`;
        return this._execCommand(context, cmd).then((revisions) => {
          try {
            return this._normalizeRevisions(JSON.parse(revisions));
          } catch (e) {
            this.log(e, {color: 'red'});
            return [];
          };
        });
      },

      _normalizeRevisions(revisions) {
        return revisions.filter((r) => !!r.revision).sort((a,b) => a.timestamp - b.timestamp)
      },

      _mergeRevision(revisions, revision) {
        revisions = revisions.filter((r) => r.revision != revision.revision);
        revisions.push(revision);
        return revisions;
      },

      _splitRevisions(revisions, splitPoint) {
        const offset = revisions.length - splitPoint;
        let keep = [], del = [];
        revisions.forEach((r, i) => {
          if (i >= offset || r.active) {
            keep.push(r);
          } else {
            del.push(r);
          }
        });
        return [del, keep];
      },

      _deleteRevisions(context, revisions) {
        const deleting = revisions.map((r) => {
          return path.posix.join(this.readConfig('dir'), this.readConfig('releasesDir'), r.revision);
        });
        return this._execCommand(context, "rm -rf " + deleting.join(" ")).then(() => {
          this.log("Purging revisions:", {color: 'green'});
          deleting.forEach((rev) => this.log(rev));
        });
      },

      _saveRevisions(context, revisions) {
        const revisionPath = path.posix.join(this.readConfig('dir'), this.readConfig('releasesDir'), 'revisions.json');
        const cmd = "echo '" + JSON.stringify(revisions) + "'  > " + revisionPath;
        return this._execCommand(context, cmd).then(() => {
          this.log("revisions.json updated", {color: 'green'});
        });
      }
    });

    return new DeployPlugin();
  }
};
