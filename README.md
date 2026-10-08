# Cloud-Native Continuous Integration Reference Architecture

![AWS](https://img.shields.io/badge/AWS-%23FF9900.svg?style=for-the-badge&logo=amazon-aws&logoColor=white) ![AWS CodeCommit](https://img.shields.io/badge/AWS_CodeCommit-F58536?style=for-the-badge&logo=amazon-aws&logoColor=white) ![Node.js](https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white) ![Jest](https://img.shields.io/badge/-jest-%23C21325?style=for-the-badge&logo=jest&logoColor=white) ![Express.js](https://img.shields.io/badge/express.js-%23404d59.svg?style=for-the-badge&logo=express&logoColor=%2361DAFB)

## Overview
This repository provides an enterprise reference implementation for an automated, cloud-native Continuous Integration (CI) pipeline engineered exclusively within the AWS ecosystem. Leveraging AWS CodeCommit, AWS CodeBuild, and AWS CodePipeline, this architecture establishes an automated release pipeline that detects source changes, executes containerized unit test gates, purges non-production dependencies, and packages verified deployment artifacts securely in Amazon S3.

## Why This Matters (Business Value & Architectural Principles)
* **Zero Infrastructure Maintenance:** Replaces traditional, self-hosted CI servers (such as static Jenkins runners) with ephemeral AWS compute environments, eliminating manual OS patching, server sizing, and idle compute costs.
* **Granular Least Privilege Access Control:** Enforces strict IAM role boundaries for service execution, ensuring that build containers and orchestration services only possess access to necessary source code and storage paths.
* **Deterministic Build Integrity:** Mitigates dependency drift and release discrepancies by enforcing strict lockfile installations (`npm ci`) and automated Jest test assertions before build outputs can be bundled.
* **Air-Gapped Source Security:** Retains proprietary source code inside the private cloud boundary via AWS CodeCommit, relying on native AWS EventBridge triggers rather than exposing public webhooks to third-party endpoints.

## Prerequisites
* **Workstation Environment:** Node.js 18 LTS or later, npm, Git, and OpenSSL installed on the local system.
* **Cloud Infrastructure Access:** An active AWS account with permissions for IAM, CodeCommit, CodeBuild, CodePipeline, and Amazon S3.
* **IAM Credentials:** An IAM User equipped with dedicated HTTPS Git credentials for AWS CodeCommit generated via the AWS Management Console.
* **Network Connectivity:** Outbound TCP port 443 access to AWS service endpoints.

## Pipeline Architecture & Execution Flow
```text
[Local Developer Workstation]
       │
       ├──► git push origin main  ──► [AWS CodeCommit Repository]
       │                                       │
       │                                (Amazon EventBridge)
       │                                       │
       │                                       ▼
       │                            [AWS CodePipeline Orchestrator]
       │                                       │
       │                                       ▼
       │                            [AWS CodeBuild Ephemeral Container]
       │                                 ├── npm ci (Deterministic Install)
       │                                 ├── npm test (Jest Test Suite)
       │                                 └── npm prune --production
       │                                       │
       │                                       ▼
       │                            [Amazon S3 Artifact Storage]
       │                             (build-artifact.zip)
       │
       └──► git push github main  ──► [GitHub Public Portfolio Mirror]
```

*(Placeholder: Insert screenshot of successful AWS CodePipeline execution here)*

***

## Phase 1: Local Application Architecture & Test Harness Engineering
The application layer consists of a modular Node.js Express microservice structured to support automated testing without port collisions.

1. **Initialize the Repository and Workspace:**
   ```bash
   mkdir cloud-native-ci-repo
   cd cloud-native-ci-repo
   git init
   npm init -y
   ```

2. **Install Core Runtime and Testing Dependencies:**
   ```bash
   npm install express
   npm install --save-dev jest supertest
   ```

3. **Decouple Router Architecture from Server Listeners:**
   * In continuous integration pipelines, automated tests must execute against the Express application instance without binding to a physical network port. Binding to a port during automated testing can cause `EADDRINUSE` errors if multiple test runners execute in parallel.
   * `app.js` encapsulates the route handling logic and health-check endpoints:
     ```javascript
     const express = require('express');
     const app = express();

     app.use(express.json());

     app.get('/health', (req, res) => {
       res.status(200).json({
         status: 'UP',
         message: 'CI/CD Reference Architecture API is operational',
         timestamp: new Date().toISOString()
       });
     });

     module.exports = app;
     ```
   * `server.js` imports the exported application object and establishes the network listener for local execution:
     ```javascript
     const app = require('./app');
     const PORT = process.env.PORT || 3000;

     app.listen(PORT, () => {
       console.log(`Service running on port ${PORT}`);
     });
     ```

4. **Construct Automated Integration Tests:**
   * Create `tests/app.test.js` using Jest and Supertest to assert that the `/health` endpoint returns a valid 200 HTTP status and expected payload:
     ```javascript
     const request = require('supertest');
     const app = require('../app');

     describe('GET /health', () => {
       it('should return 200 OK and UP status payload', async () => {
         const response = await request(app).get('/health');
         expect(response.statusCode).toBe(200);
         expect(response.body.status).toBe('UP');
       });
     });
     ```

5. **Configure NPM Scripts and Exclusion Rules:**
   * In `package.json`, set `"test": "jest"` to standardize test invocation across local and remote environments.
   * Create a `.gitignore` file containing `node_modules/` and `.env` to prevent committing local dependencies or transient binaries.

***

## Phase 2: Build Specification Engineering (`buildspec.yml`)
AWS CodeBuild uses a declarative YAML specification to manage build phases inside an ephemeral container.

1. **Author the `buildspec.yml` in the Repository Root:**
   ```yaml
   version: 0.2

   phases:
     install:
       runtime-versions:
         nodejs: 18
       commands:
         - echo "Installing production and test dependencies deterministically..."
         - npm ci
     pre_build:
       commands:
         - echo "Executing automated test suite..."
         - npm test
     build:
       commands:
         - echo "Stripping devDependencies for lean deployment..."
         - npm prune --production
   artifacts:
     files:
       - '**/*'
     name: build-artifact.zip
   ```

2. **Technical Rationale for Lifecycle Phases:**
   * **`npm ci` (Install Phase):** Bypasses the dependency resolution algorithm used by `npm install`. It deletes existing `node_modules` and strictly installs exact dependency versions from `package-lock.json`, preventing discrepancies across environments.
   * **`npm test` (Pre-Build Phase):** Acts as a quality gate. If any unit test fails, the process exits with status code 1. CodeBuild halts immediately, preventing defective code from reaching downstream packaging stages.
   * **`npm prune --production` (Build Phase):** Removes development-only dependencies (such as Jest and Supertest) from `node_modules`. This minimizes artifact file size and prevents test frameworks from entering production distributions.
   * **Artifacts Block:** Instructs CodeBuild to package all application files into an archive named `build-artifact.zip`.

***

## Phase 3: Dual Remote Git Architecture & CodeCommit Setup
Enterprise setups often require maintaining an internal operational repository while syncing with an external portfolio mirror.

1. **Create the CodeCommit Repository:**
   ```bash
   aws codecommit create-repository --repository-name cloud-native-ci-repo --repository-description "Cloud-Native CI Reference Architecture"
   ```

2. **Configure IAM Git Authentication:**
   * Generate dedicated HTTPS Git credentials under your IAM User profile in the AWS Management Console (**IAM > Users > Security Credentials > HTTPS Git credentials for AWS CodeCommit**).

3. **Resolve Linux Credential Helper and Routing Hangs:**
   * On Linux distributions, terminal commands can hang when graphical credential managers (like GNOME Keyring) fail to open in headless or terminal environments, or when networks fail to route IPv6 traffic.
   * Clear the local credential helper configuration and force IPv4 routing:
     ```bash
     git config --local credential.helper ""
     git remote add origin https://git-codecommit.<AWS_REGION>[.amazonaws.com/v1/repos/cloud-native-ci-repo](https://.amazonaws.com/v1/repos/cloud-native-ci-repo)
     git push -4 -u origin main
     ```

4. **Attach the Public Portfolio Mirror:**
   * Add your GitHub repository as an independent remote:
     ```bash
     git remote add github [https://github.com/](https://github.com/)<GITHUB_USERNAME>/cloud-native-ci-repo.git
     git push -u github main
     ```
   * *Architectural Note:* Dual remotes maintain full isolation. Pushing to `origin` updates AWS CodeCommit and triggers your CI pipeline; pushing to `github` keeps your external portfolio current without interfering with AWS operations.

***

## Phase 4: Serverless Build Provisioning (AWS CodeBuild)
CodeBuild provides managed, ephemeral compute environments to execute the build specification.

1. **Provision the CodeBuild Project:**
   * **Project Name:** `cloud-native-ci-build`
   * **Source Provider:** AWS CodeCommit (`cloud-native-ci-repo`, branch `main`)
   * **Environment Image:** Managed image, Ubuntu OS, Standard runtime, latest image version (`aws/codebuild/standard:7.0`).
   * **Service Role:** Create a new service role (`<CODEBUILD_IAM_ROLE_NAME>`).
   * **Buildspec:** Select "Use a buildspec file".
   * **Artifacts:** Select "No artifacts".
2. **Technical Rationale:**
   * Selecting **No artifacts** in CodeBuild is intentional. In this architecture, AWS CodePipeline acts as the orchestrator. When CodePipeline triggers a build, it automatically injects its own managed S3 bucket into the CodeBuild project at runtime, centralizing artifact versioning.
   * The dedicated IAM role gives the build runner least-privilege permissions to read from CodeCommit and stream logs to Amazon CloudWatch without granting broader account access.

***

## Phase 5: Pipeline Orchestration & Artifact Management (AWS CodePipeline)
AWS CodePipeline manages the flow between source changes, build execution, and artifact archiving.

1. **Construct the Custom Pipeline:**
   * **Creation Mode:** Select **Build custom pipeline** rather than predefined templates. Opinionated templates often require target deployment groups (like ECS or ECR), whereas our architecture focuses specifically on continuous integration and artifact creation.
   * **Pipeline Settings:** Name the pipeline `cloud-native-ci-pipeline`, select **V2** execution mode, and generate an automated service role (`<CODEPIPELINE_IAM_ROLE_NAME>`).
   * **Source Stage:** Provider: **AWS CodeCommit**, Repository: `cloud-native-ci-repo`, Branch: `main`. Enable **Amazon CloudWatch Events** for real-time change detection.
   * **Build Stage:** Provider: **Other build providers > AWS CodeBuild**, Project Name: `cloud-native-ci-build`, Build Type: **Single build**.
   * **Deploy Stage:** Select **Skip deploy stage**.
2. **Execution Flow:**
   * Once created, CodePipeline runs an initial execution. It pulls source code from CodeCommit, triggers the CodeBuild container, executes unit tests, and stores the resulting archive in an S3 bucket.

*(Placeholder: Insert screenshot of the generated S3 Bucket artifact here)*

***

## Phase 6: Continuous Integration Automation Validation
To verify end-to-end automation, changes must trigger the pipeline without manual intervention.

1. **Introduce a State Change:**
   * Update the status payload in `app.js` to verify pipeline change detection:
     ```javascript
     message: 'CI/CD Reference Architecture API is operational v2'
     ```
2. **Commit and Push to CodeCommit:**
   ```bash
   git add app.js
   git commit -m "fix: update health check response payload for automation validation"
   git push -4 origin main
   ```
3. **Verify Execution:**
   * Amazon EventBridge detects the commit on the `main` branch.
   * CodePipeline triggers automatically, transitioning the Source stage and Build stage to "In Progress", and then "Succeeded".
   * CodeBuild runs the test suite and exports the updated artifact to Amazon S3.

***

## IAM Roles & Access Governance
This project relies on strictly scoped service roles rather than long-lived user credentials:

| Service / Role Name | Role Purpose | Permissions Granted |
| :--- | :--- | :--- |
| `<CODEBUILD_IAM_ROLE_NAME>` | Ephemeral build container execution | Read access to CodeCommit, write access to Amazon CloudWatch logs |
| `<CODEPIPELINE_IAM_ROLE_NAME>` | Pipeline orchestration engine | Permissions to invoke CodeBuild, monitor CodeCommit, and read/write to the pipeline S3 bucket |

***

## Troubleshooting & Operational Edge Cases

* **AWS CodeCommit Authentication Hang on Linux:**
  * *Symptom:* The terminal hangs indefinitely when executing `git push origin main`.
  * *Root Cause:* The operating system credential manager is waiting for an interactive GUI prompt, or the connection is stalling over an unsupported IPv6 route.
  * *Resolution:* Run `git config --local credential.helper ""` to force terminal-based credential input, and append `-4` (`git push -4 origin main`) to route traffic over IPv4.

* **Pipeline Failures at the `pre_build` Phase:**
  * *Symptom:* CodeBuild exits with an error status during the `pre_build` phase.
  * *Root Cause:* One or more Jest assertions failed in `tests/app.test.js`.
  * *Resolution:* The pipeline is designed to halt on failing tests. Check the Amazon CloudWatch logs for details on the failed assertion, fix the issue locally, verify that `npm test` passes, and push a new commit.

* **Lockfile Inconsistencies During `npm ci`:**
  * *Symptom:* CodeBuild fails during the install phase with an `npm ERR!` lockfile error.
  * *Root Cause:* Dependencies in `package.json` were added or updated without committing the matching `package-lock.json`.
  * *Resolution:* Run `npm install` locally to update `package-lock.json`, and commit both files together before pushing to the repository.
