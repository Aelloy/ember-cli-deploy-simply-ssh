/* jshint node: true */
'use strict';

var RSVP = require('rsvp');
var BasePlugin = require('ember-cli-deploy-plugin');
var node_ssh = require('node-ssh');
var path = require('path');

module.exports = {
  name: 'ember-cli-deploy-simply-ssh',

  createDeployPlugin: function(options) {
    var DeployPlugin = BasePlugin.extend({
      name: options.name,

      after: ["ember-cli-deploy-revision-data"],
      defaultConfig: {
        dir: '/var/www',
        keep: 2
      },

      setup: function() {
        var ssh = new node_ssh();
        return ssh.connect(this.readConfig('connection')).then(function(conn) {
          this.log("SSH connection established.", {color: "green"});
          return {ssh: conn};
        }.bind(this));
      },

      fetchRevisions: function(context) {
        return this._findRevisionsWithActive(context).then(function(revisions){
          return {revisions: revisions};
        });
      },

      willUpload: function(context) {
        var dir = this.readConfig('dir');
        if (context.revisionData) {
          dir = path.join(dir, 'releases', context.revisionData.revisionKey);
        };
        this.log("Creating directory " + dir, {color: "green"});
        return this._execCommand(context, 'mkdir -p ' + dir).then(function(){
          return {releaseDir: dir};
        });
      },

      upload: function(context) {
        this.log("Uploading files.", {color: "green"});
        var files = context.gzippedFiles || context.distFiles;
        var plugin = this;
        var distDir = path.join(process.cwd(), context.distDir);
        return files.reduce(function(p, file) {
          return p.then(function(s){
            var local = path.join(distDir, file);
            var remote = path.join(context.releaseDir, file);
            return context.ssh.putFile(local, remote).then(function(){
              plugin.log(file);
            });
          });
        }, RSVP.Promise.resolve());
      },

      didUpload: function(context) {
        var that = this;
        this.log("Checking old releases to purge...", {color: 'green'});
        return this._findRevisionsWithActive(context).then(function(revisions){
          var keep = that.readConfig('keep');
          revisions.splice(-keep, keep);
          var toDelete = revisions.filter(function(rev) {
            return !rev.active;
          }).map(function(rev) {
            return path.join(that.readConfig('dir'), 'releases', rev.revision);
          });
          if (toDelete.length > 0) {
            return that._execCommand(context, "rm -rf " + toDelete.join(" ")).then(function(){
              that.log("Purging revisions:", {color: 'green'});
              toDelete.forEach(function(rev){
                that.log(rev);
              });
            });
          };
        });
      },

      activate: function(context) {
        var revision = context.commandOptions.revision;
        var source = path.join(this.readConfig('dir'), 'releases', revision);
        var target = path.join(this.readConfig('dir'), 'current');
        this._execCommand(context, "ln -sfn " + source + " " + target).then(function(){
          this.log("Revision " + revision + " is now active!", {color: 'green'})
        }.bind(this));
      },

      teardown: function(context) {
        context.ssh.dispose();
        this.log("SSH connection closed", {color: 'green'});
      },

      _execCommand: function(context, command){
        return new RSVP.Promise(function(resolve, reject) {
          context.ssh.execCommand(command, {stream: 'both'}).then(function(result) {
            if (result.stderr) {
              reject(result.stderr);
            };
            resolve(result.stdout);
          }, function(error) {
            reject(error);
          });
        });
      },

      _findRevisionsWithActive: function(context) {
        return RSVP.hash({
          revisions: this._findRevisions(context),
          active: this._findActiveRevision(context)
        }).then(function(result){
          return result.revisions.map(function(r){
            r.active = r.revision == result.active;
            return r;
          });
        });
      },

      _findRevisions: function(context) {
        var releasesDir = path.join(this.readConfig('dir'), 'releases');
        return context.ssh.requestSFTP().then(function(sftp){
          return new RSVP.Promise(function(resolve, reject){
            sftp.readdir(releasesDir, function(err, list) {
              if (err) reject(err);
              var rs = list.map(function(l) {
                return {revision: l.filename, timestamp: l.attrs.mtime * 1000};
              }).sort(function(a,b) { a.timestamp - b.timestamp });
              resolve(rs);
            });
          });
        });
      },

      _findActiveRevision: function(context) {
        var dir = path.join(this.readConfig('dir'), 'current');
        return this._execCommand(context, "readlink " + dir).then(function(file){
          return path.basename(file);
        });
      }

    });


    return new DeployPlugin();
  }
};
