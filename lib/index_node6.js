'use strict';

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

const chalk = require('chalk');

const get = (obj, path, defaultValue) => {
  return path.split('.').filter(Boolean).every(step => !(step && !(obj = obj[step]))) ? obj : defaultValue;
};

class AssociateWafPlugin {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.provider = this.serverless.providers.aws;

    this.config = get(this.serverless.service, 'custom.associateWaf', {});

    this.hooks = {};

    this.hooks['after:deploy:deploy'] = this.updateWafAssociation.bind(this);
  }

  defaultStackName() {
    return `${this.serverless.service.getServiceName()}-${this.provider.getStage()}`;
  }

  getApiGatewayStageArn(restApiId) {
    return `arn:aws:apigateway:${this.provider.getRegion()}::/restapis/${restApiId}/stages/${this.provider.getStage()}`;
  }

  updateWafAssociation() {
    var _this = this;

    return _asyncToGenerator(function* () {
      _this.config = get(_this.serverless.service, 'custom.associateWaf', {});
      if (_this.config && _this.config.name && _this.config.name.trim().length != 0) {
        yield _this.associateWaf();
      } else {
        yield _this.disassociateWaf();
      }
    })();
  }

  findWebAclByName(name) {
    var _this2 = this;

    return _asyncToGenerator(function* () {
      const response = yield _this2.provider.request('WAFRegional', 'listWebACLs', { Limit: 100 });
      if (response.WebACLs) {
        for (let webAcl of response.WebACLs) {
          if (name === webAcl.Name) {
            return webAcl.WebACLId;
          }
        }
      }
    })();
  }

  findStackResourceByLogicalId(stackName, logicalId) {
    var _this3 = this;

    return _asyncToGenerator(function* () {
      const response = yield _this3.provider.request('CloudFormation', 'listStackResources', { StackName: stackName });
      if (response.StackResourceSummaries) {
        for (let resourceSummary of response.StackResourceSummaries) {
          if (logicalId === resourceSummary.LogicalResourceId) {
            return resourceSummary;
          }
        }
      }
    })();
  }

  getRestApiId() {
    var _this4 = this;

    return _asyncToGenerator(function* () {
      const apiGateway = _this4.serverless.service.provider.apiGateway;
      if (apiGateway && apiGateway.restApiId) {
        return apiGateway.restApiId;
      }

      const stackName = _this4.serverless.service.provider.stackName || _this4.defaultStackName();

      const stackResource = yield _this4.findStackResourceByLogicalId(stackName, 'ApiGatewayRestApi');
      if (stackResource && stackResource.PhysicalResourceId) {
        return stackResource.PhysicalResourceId;
      }
    })();
  }

  associateWaf() {
    var _this5 = this;

    return _asyncToGenerator(function* () {
      try {
        const restApiId = yield _this5.getRestApiId();
        if (!restApiId) {
          _this5.serverless.cli.log('Unable to determine REST API ID');
          return;
        }

        const webAclId = yield _this5.findWebAclByName(_this5.config.name);
        if (!webAclId) {
          _this5.serverless.cli.log(`Unable to find WAF named '${_this5.config.name}'`);
          return;
        }

        const params = {
          ResourceArn: _this5.getApiGatewayStageArn(restApiId),
          WebACLId: webAclId
        };

        _this5.serverless.cli.log('Associating WAF...');
        yield _this5.provider.request('WAFRegional', 'associateWebACL', params);
      } catch (e) {
        console.error(chalk.red(`\n-------- Associate WAF Error --------\n${e.message}`));
      }
    })();
  }

  disassociateWaf() {
    var _this6 = this;

    return _asyncToGenerator(function* () {
      try {
        const restApiId = yield _this6.getRestApiId();
        if (!restApiId) {
          _this6.serverless.cli.log('Unable to determine REST API ID');
          return;
        }

        const params = {
          ResourceArn: _this6.getApiGatewayStageArn(restApiId)
        };

        const webACLForResource = yield _this6.provider.request('WAFRegional', 'getWebACLForResource', params);
        if (webACLForResource.WebACLSummary) {
          _this6.serverless.cli.log('Disassociating WAF...');
          yield _this6.provider.request('WAFRegional', 'disassociateWebACL', params);
        }
      } catch (e) {
        console.error(chalk.red(`\n-------- Disassociate WAF Error --------\n${e.message}`));
      }
    })();
  }
}

module.exports = AssociateWafPlugin;