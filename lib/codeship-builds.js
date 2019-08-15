'use babel';

import { CompositeDisposable } from 'atom';
import fs from "fs";
import path from "path";

const baseUrl = "https://api.codeship.com/v2";

export default {
  statusBarTile: null,
  dockPane: null,
  authorization: "",
  attempts: 0,

  activate(state) {
    this.checkCodeshipYml()
      .then(() => {
        this.doCodeship();
        this.addDockPane();
        setInterval(() => this.doCodeship(), this.updateInterval);
      })
      .catch(err => console.log(err));
  },

  deactivate() {},

  serialize() {},

  checkCodeshipYml() {
    return new Promise((resolve, reject) => {
      fs.readFile(atom.project.getPaths()[0] + "/.codeshipbuilds.json", "utf8", (err, file) => {
        if (err) {
          reject(err);
        }
        try {
          const cfg = JSON.parse(file.toString());
          this.organisation = cfg.organisation;
          this.project = cfg.project;
          this.updateInterval = cfg.updateInterval;
          this.username = cfg.username;
          this.password = cfg.password;
          this.filterByUser = cfg.filterByUser || null;
          resolve(cfg);
        } catch (e) {
          console.log(e);
        }
      });
    });
  },

  getAuthentication() {
    const base64 = btoa(`${this.username}:${this.password}`);
    const headers = new Headers([
      ["Authorization", `Basic ${base64}`],
      ["Content-Type", "application/json"],
    ]);

    return new Promise(async (resolve, reject) => {
      try {
        const response = await fetch(baseUrl + "/auth", { headers, method: "POST" })
        const data = await response.json();
        if (Array.isArray(data.errors)) {
          reject(data.errors[0].toLowerCase());
        } else {
          this.authorization = data.access_token;
          if (!this.organisation) this.organisation = data.organizations[0].uuid;
          resolve(this.authorization);
        }
      } catch (e) {
        console.log(e);
      }
    });
  },

  getBuilds() {
    const headers = new Headers([
      ["Authorization", `Bearer ${this.authorization}`],
      ["Content-Type", "application/json"],
    ]);

    return new Promise(async (resolve, reject) => {
      try  {
        const response = await fetch(baseUrl + `/organizations/${this.organisation}/projects/${this.project}/builds`, { headers });
        const data = await response.json();
        if (Array.isArray(data.errors)) {
          reject(new Error(data.errors[0].toLowerCase()));
          return;
        } else {
          resolve(data.builds);
        }

        this.drawTile(data.builds);
        this.updateDockPane(data.builds);
      } catch (e) {
        console.log(e);
      }
    });
  },

  doCodeship() {
    return new Promise(async (resolve, reject) => {
      console.log("[codeship-builds] Fetching builds");
      try {
        await this.getBuilds();
      } catch (e) {
        console.log(e);
        if (e.message === "unauthorized") {
          this.getAuthentication().then(() => { this.doCodeship() });
        }
      }
    });
  },

  drawTile(builds) {
    let latestBuild = this.filterByUser
      ? builds.filter(build => build.username === this.filterByUser)[0]
      : builds[0];

    if (!latestBuild) {
      latestBuild = builds[0];
    }

    this.branch = document.createElement("span");
    this.branch.setAttribute("class", `codeship-builds-container__branch codeship-builds-container__branch--${latestBuild.status}`);
    this.branch.innerHTML = latestBuild.ref.replace("heads/", "");

    this.committer = document.createElement("span");
    this.committer.setAttribute("class", `codeship-builds-container__committer codeship-builds-container__committer--${latestBuild.status}`);
    this.committer.innerHTML = latestBuild.username;

    if (!this.statusBarTile) {
      const tile = document.createElement("span");
      tile.setAttribute("class", "codeship-builds-container");
      this.statusBarTile = this.statusBar.addRightTile({ item: tile, priority: 999 });
    }

    const tile = this.statusBarTile.getItem();
    tile.innerHTML = "";
    tile.appendChild(this.branch);
    tile.appendChild(this.committer);
  },

  addDockPane() {
    const table = document.createElement("table");
    const tbody = document.createElement("tbody");
    tbody.innerHTML = "Fetching Codeship Builds …";
    table.appendChild(tbody);

    this.dockPane = document.createElement("div");
    this.dockPane.setAttribute("class", "codeship-builds-dock");
    this.dockPane.appendChild(table);

    const item = {
      element: this.dockPane,
      getTitle: () => "Codeship Builds",
      getDefaultLocation: () => "bottom",
      getURI: () => "atom://codeship-builds/mission-control",
    };

    atom.workspace.toggle(item).then(() => {
      atom.workspace.hide("atom://codeship-builds/mission-control");
    });
  },

  updateDockPane(builds) {
    const tbody = this.dockPane.querySelector("tbody");
    tbody.innerHTML = "";

    builds.forEach(build => {
      const buildName = document.createElement("td");
      buildName.setAttribute("class", "codeship-builds-dock__cell codeship-builds-dock__cell--build");
      buildNameLink = document.createElement("a");
      buildNameLink.innerHTML = build.ref.replace("heads/", "");
      // buildNameLink.setAttribute("href", build.links.pipelines);
      buildName.appendChild(buildNameLink);

      const committerName = document.createElement("td");
      committerName.setAttribute("class", "codeship-builds-dock__cell codeship-builds-dock__cell--committer");
      committerName.innerHTML = build.username;

      const buildCommit = document.createElement("td");
      buildCommit.setAttribute("class", "codeship-builds-dock__cell codeship-builds-dock__cell--commit");
      buildCommit.innerHTML = build.commit_message;

      const buildStatus = document.createElement("td");
      buildStatus.setAttribute("class", "codeship-builds-dock__cell codeship-builds-dock__cell--status");
      buildStatus.innerHTML = build.status;

      const row = document.createElement("tr");
      row.setAttribute("class", `codeship-builds-dock__row codeship-builds-dock__row--${build.status}`);
      row.appendChild(buildName);
      row.appendChild(committerName);
      row.appendChild(buildCommit);
      // row.appendChild(buildStatus);

      tbody.appendChild(row);
    });

  },

  consumeStatusBar(statusBar) {
    this.statusBar = statusBar;
  },
};
