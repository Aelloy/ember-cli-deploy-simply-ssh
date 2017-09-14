/* jshint node: true */
'use strict';

let RSVP = require('rsvp');

module.exports = class SshStub {
  constructor() {
    this.up = true;
    this.commResponse = {stdout: ""};
    this.commands = [];
  }

  connect(params) {
    return new RSVP.Promise((resolve, reject) => {
      if (params) {
        resolve(this);
      } else {
        reject("config.host or config.sock must be provided");
      }
    });
  }

  dispose() {
    this.up = false;
  }

  putFile(source, target) {
    return this.up ? RSVP.Promise.resolve() : RSVP.Promise.reject("Connection is down");
  }

  execCommand(command) {
    this.commands.push(command);
    return RSVP.Promise.resolve(this.commResponse);
  }

  connectionState(up) {
    this.up = up;
  }

  commandResponse(response) {
    this.commResponse = response;
  }
}
