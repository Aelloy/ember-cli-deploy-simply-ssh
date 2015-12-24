/* jshint node: true */
'use strict';

var CoreObject = require('core-object');
var Promise = require('ember-cli/lib/ext/promise');
var node_ssh = require('node-ssh');

module.exports = CoreObject.extend({
  init: function(conf, plugin) {
    this.plugin = plugin;
    conf.privateKey = require('fs').readFileSync(conf.key).toString();

    this.ssh = new node_ssh();
    this.ssh.connect(conf);
  },
  
  log: function(msg, opts) {
    this.plugin.log(msg, opts || {color: 'green'})
  },
  
  close: function() {
    this.ssh.end();
    this.log("SSH connection closed.")
  },
  
  execCommand: function(command, msg){
    return this.ssh.execCommand(command, {stream: 'both'}).then(function(result) {
      this.log(msg);
      if (result.stdout) {
        this.log('Stdout: ' + result.stdout);
      }
      if (result.stderr) {
        this.log('Stderr: ' + result.stderr, {color: 'red'});
      }
    }.bind(this));
  },
  
  createDir: function(dir) {
    return this.execCommand('mkdir -p ' + dir, 'Creating directory: ' + dir);
  },

  updateLink: function(source, target) {
    return this.execCommand("ln -sfn " + source + " " + target, 'Updating symlink.');
  },

  uploadFiles: function(files, distDir, releaseDir) {
    var processed = files.map(function(item){
      return [item, [distDir, item].join('/'), [releaseDir, item].join('/')];
    });
    processed.push(['index.html', [distDir, 'index.html'].join('/'), [releaseDir, 'index.html'].join('/')]);
    
    var promises = processed.map(function(item){
      var fileName = item[0];

      return this.ssh.put(item[1], item[2]).then(function() {
        this.log(fileName + " uploaded.");
      }.bind(this), function(error) {
        this.log(fileName + " failed to upload.", {color: 'red'});
        this.log(error, {color: 'red'});
      }.bind(this));    
    }.bind(this));
    return Promise.all(promises);
  },  
})
