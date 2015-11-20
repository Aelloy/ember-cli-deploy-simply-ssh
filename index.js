/* jshint node: true */
'use strict';

var SSH = require('./lib/ssh');
var DeployPluginBase = require('ember-cli-deploy-plugin');

module.exports = {
  name: 'ember-cli-deploy-ssh',

  createDeployPlugin: function(options) {
    var DeployPlugin = DeployPluginBase.extend({
      name: options.name,

      requiredConfig: ['host', 'port', 'dir'],
      defaultConfig: {
        host: 'localhost',
        port: 22,
        dir: '/var/www',
        releasesDir: function(context) {
          return this.readConfig('dir') + '/releases';
        },
        fullDistDir: function(context) {
          return [process.cwd(), context.distDir].join('/');
        }
      },

      setup: function(context) {
        this.conn = new SSH({
            host:       this.readConfig('host'),
            port:       this.readConfig('port'),
            username:   this.readConfig('user'),
            password:   this.readConfig('password'),
            passphrase: this.readConfig('passphrase'),
            key:        this.readConfig('key')
        }, this);
        return Promise.resolve(this.conn.ssh).then(function(){
          this.log("SSH connection established.", {color: "green"})
        }.bind(this));
      },

      teardown: function(context) {
        return this.conn.close();
      },

      prepare: function(context) {
        var releaseDir = this._releaseDir(context);
        return this.conn.createDir(releaseDir);
      },

      upload: function(context) {
        var files = context.gzippedFiles || context.distFiles;
        var distDir = this.readConfig('fullDistDir');
        return this.conn.uploadFiles(files, distDir, this._releaseDir(context));
      },

      didUpload: function(context) {
        var source = this._releaseDir(context);
        var target = this.readConfig('dir') + '/current';
        return this.conn.updateLink(source, target);
      },

      _revisionKey: function(context) {
        return context.revisionData.revisionKey;
      },

      _releaseDir: function(context) {
        return this.readConfig('releasesDir') + '/' + this._revisionKey(context);
      }

    });
    
    
    return new DeployPlugin();
  }
};
