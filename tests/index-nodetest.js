/* jshint node: true */
'use strict';

const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const SshStub = require('./ssh-stub.js');
const RSVP = require('rsvp');
const Plugin = require('../index.js');
chai.use(chaiAsPromised);

var assert = chai.assert;

describe('simply-ssh', () => {
  var subject, mockUi, plugin, context, revisions;

  beforeEach(() => {
    subject = Plugin;
    mockUi = {
      verbose: true,
      messages: [],
      write() {},
      writeLine(m) { this.messages.push(m); },
      received(reg) {
        return this.messages.some((m) => reg.test(m));
      }
    };
    context = {
      distDir: process.cwd() + '/tests/fixtures/dist',
      distFiles: ['app.css', 'app.js', 'app.map'],
      ui: mockUi,
      ssh: 0,
      config: {
        "simply-ssh": {
          sshClient: new SshStub(),
          connection: {
            username: "deploy",
            host: "localhost"
          }
        }
      },
      ssh: new SshStub()
    };
    plugin = subject.createDeployPlugin({
      name: 'simply-ssh'
    });
  });

  it('has a name', () => {
    assert.equal(plugin.name, 'simply-ssh');
  });

  describe('setup hook:', () => {
    it('rejects when connection params missing', () => {
      delete context.config["simply-ssh"].connection;
      delete context.config["simply-ssh"].sshClient;
      plugin.beforeHook(context);
      return assert.isRejected(plugin.setup(context)).then((e) => {
        assert.equal(e.message, "config.host or config.sock must be provided");
      });
    });

    it('connects with valid params', () => {
      plugin.beforeHook(context);
      return assert.isFulfilled(plugin.setup(context)).then((context) => {
        assert.ok(mockUi.received(/SSH connection established/));
        assert.ok(context.ssh instanceof SshStub);
      });
    });
  });

  describe('fetchRevisions hook:', () => {
    it('retrieves revisions.json with normalization', () => {
      revisions = [
        {revision: "1", timestamp: Date.now() - 50000},
        {revision: "2", timestamp: Date.now() - 100000},
        {revision: "3", timestamp: Date.now()},
        {trash: "LOL"} // Just to check we wouldn't consider corrupt data
      ]
      plugin.beforeHook(context);
      plugin.configure(context);
      context.ssh.commandResponse({stdout: JSON.stringify(revisions)});
      return assert.isFulfilled(plugin.fetchRevisions(context)).then((res) => {
        assert.equal(res.revisions.length, 3);
        assert.equal(res.revisions[0].revision, "2");
        assert.equal(res.revisions[1].revision, "1");
        assert.equal(res.revisions[2].revision, "3");
      });
    });
  });

  describe('willUpload hook:', () => {
    it('with -revision-data', () => {
      context.revisionData = {
        revisionKey: "COOLREVISION"
      };
      plugin.beforeHook(context);
      plugin.configure(context);
      const dir = "/var/www/releases/COOLREVISION";
      return assert.isFulfilled(plugin.willUpload(context)).then((context) => {
        assert.ok(mockUi.received(new RegExp("Creating directory " + dir)));
        assert.equal(context.releaseDir, dir);
      });
    });

    it('without -revision-data', () => {
      plugin.beforeHook(context);
      plugin.configure(context);
      const dir = "/var/www";
      return assert.isFulfilled(plugin.willUpload(context)).then((context) => {
        assert.ok(mockUi.received(new RegExp("Creating directory " + dir)));
        assert.equal(context.releaseDir, dir);
      });
    });
  });

  describe('upload hook:', () => {
    beforeEach(() => {
      context.releaseDir = '/var/www/release';
    });

    it('uploads files one-by-one without -release-data', () => {
      plugin.beforeHook(context);
      return assert.isFulfilled(plugin.upload(context)).then((res) => {
        assert.ok(mockUi.received(/Uploading files/));
        context.distFiles.forEach((file) => {
          assert.ok(mockUi.received(new RegExp(file)));
        });
        assert.notOk(res);
      });
    });

    it('uploads files one-by-one with -release-data', () => {
      context.revisionData = {
        revisionKey: "COOLREVISION"
      };
      plugin.beforeHook(context);
      return assert.isFulfilled(plugin.upload(context)).then((res) => {
        assert.equal(res.uploadedRevision.revision, "COOLREVISION");
        assert.ok(res.uploadedRevision.timestamp - Date.now() < 50);
      });
    });

    it('uploads files one-by-one with -ignore-pattern', () => {
      context.config["simply-ssh"].ignorePattern = "*.map";
      plugin.beforeHook(context);
      return assert.isFulfilled(plugin.upload(context)).then((res) => {
        assert.ok(mockUi.received(/Uploading files/));
        assert.notOk(mockUi.received(new RegExp("app.map")));
        assert.notOk(res);
      });
    });

    it('rejects when connection is down', () => {
      plugin.beforeHook(context);
      context.ssh.connectionState(false);
      return assert.isRejected(plugin.upload(context)).then((e) => {
        assert.equal(e, "Connection is down");
      });
    });
  });

  describe('didUpload hook:', () => {
    beforeEach(() => {
      context.uploadedRevision = {revision: "4", timestamp: Date.now(), active: false};
      revisions = [
        {revision: "1", timestamp: Date.now() - 50000, active: true},
        {revision: "2", timestamp: Date.now() - 100000, active: false},
        {revision: "3", timestamp: Date.now() - 1000, active: false},
      ];
      plugin._fetchRevisionsJson = (context) => { return RSVP.resolve(revisions) };
      plugin.beforeHook(context);
      plugin.configure(context);
    });

    it('cleans up old revisions if above `keep`', () => {
      return assert.isFulfilled(plugin.didUpload(context)).then(() => {
        const deletedDir = new RegExp('/var/www/releases/2');
        const updatedRevs = revisions.filter((r) => r.revision == 2)
          .push(context.uploadedRevision);
        const mask = new RegExp(JSON.stringify(updatedRevs));
        assert.ok(mockUi.received(/Purging revisions/));
        assert.ok(mockUi.received(deletedDir));
        assert.ok(mockUi.received(/revisions\.json updated/));
        assert.ok(context.ssh.commands.some((c) => {
          return deletedDir.test(c) && /rm -rf/.test(c);
        }));
        assert.ok(context.ssh.commands.some((c) => {
          return mask.test(c);
        }));
      });
    });
  });

  describe('activate hook:', () => {
    beforeEach(() => {
      context.releaseDir = '/var/www/release';
      context.commandOptions = {
        revision: "12345"
      };
      plugin.beforeHook(context);
      plugin.configure(context);
    });

    it('creates symbolic link to selected release', () => {
      return assert.isFulfilled(plugin.activate(context)).then((res) => {
        assert.ok(mockUi.received(/Revision 12345 is now active!/));
        assert.equal(res.activatedRevision, "12345");
      });
    });

    it('does nothing if revisions are not supported', () => {
      delete context.commandOptions.revision;
      plugin.beforeHook(context);
      return assert.isFulfilled(plugin.activate(context)).then((res) => {
        assert.notOk(mockUi.received(/is now active!/));
        assert.notOk(res);
      });
    });

    it('stops pipeline if release is missing', () => {
      context.ssh.commandResponse({stderr: "Revision is missing!"});
      return assert.isRejected(plugin.activate(context)).then((e) => {
        assert.equal(e, "Revision is missing!");
      });
    });
  });

  describe('didActivate hook:', () => {
    it('does nothing if activatedRevision is undefined', () => {
      plugin.beforeHook(context);
      plugin.configure(context);
      return assert.isFulfilled(plugin.didActivate(context)).then((res) => {
        assert.notOk(res);
      });
    });

    it('updated revisions.json after activate', () => {
      context.activatedRevision = "12345";
      let oldRev = {revision: "LOL", timestamp: Date.now() - 50000, active: true};
      let newRev = {revision: "12345", timestamp: Date.now(), active: false};
      context.revisions = [oldRev, newRev];
      plugin.beforeHook(context);
      plugin.configure(context);
      return assert.isFulfilled(plugin.didActivate(context)).then((res) => {
        assert.notOk(res);
        oldRev.active = false;
        newRev.active = true;
        const mask = new RegExp(JSON.stringify([oldRev, newRev]));
        assert.ok(mask.test(context.ssh.commands[0]));
      });
    });
  });

  describe('teardown hook:', () => {
    it('shuts down ssh', () => {
      plugin.beforeHook(context);
      plugin.teardown(context);
      assert.notOk(context.ssh.up);
      assert.ok(mockUi.received(/SSH connection closed/));
    });
  });
});
