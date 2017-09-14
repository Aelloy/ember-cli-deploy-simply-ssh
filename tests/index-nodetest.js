let chai = require('chai');
let chaiAsPromised = require("chai-as-promised");
let SshStub = require("./ssh-stub.js");
chai.use(chaiAsPromised);

var assert = chai.assert;

describe('simply-ssh', () => {
  var subject, mockUi;

  beforeEach(() => {
    subject = require('../index');
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
      distFiles: ['app.css', 'app.js'],
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
      delete context.config["simply-ssh"].connection
      delete context.config["simply-ssh"].sshClient
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
    it('assigns revisions if revisions.json found on server', () => {

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

    it('rejects when connection is down', () => {
      plugin.beforeHook(context);
      context.ssh.connectionState(false);
      return assert.isRejected(plugin.upload(context)).then((e) => {
        assert.equal(e, "Connection is down");
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
      return assert.isFulfilled(plugin.activate(context)).then(() => {
        assert.ok(mockUi.received(/Revision 12345 is now active!/));
      });
    });

    it('stops pipeline if release is missing', () => {
      context.ssh.commandResponse({stderr: "Revision is missing!"});
      return assert.isRejected(plugin.activate(context)).then((e) => {
        assert.equal(e, "Revision is missing!");
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
