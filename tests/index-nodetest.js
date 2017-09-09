var chai  = require('chai');
var chaiAsPromised = require("chai-as-promised");
chai.use(chaiAsPromised);

var assert = chai.assert;

var stubProject = {
  name: function(){
    return 'my-project';
  }
};

describe('my new plugin', function() {
  var subject, mockUi;

  beforeEach(function() {
    subject = require('../index');
    mockUi = {
      verbose: true,
      messages: [],
      write: function() { },
      writeLine: function(message) {
        this.messages.push(message);
      }
    };
  });

  it('has a name', function() {
    var result = subject.createDeployPlugin({
      name: 'test-plugin'
    });

    assert.equal(result.name, 'test-plugin');
  });

  describe('hook',function() {
    var plugin;
    var context;

    it('calls the hook', function() {
      plugin = subject.createDeployPlugin({name:'my plugin' });
      context = {
        ui: mockUi,
        project: stubProject,
        config: { "my-plugin": {
            pluginClient: function(context) {
              return {
                upload: function(context) {
                  return Promise.resolve();
                }
              };
            }
          }
        }
      };
      return assert.isFulfilled(plugin.upload(context))
    });
  });
});
