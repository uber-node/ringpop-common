Tool to create a nice Grafana dashboard.

# Usage

* You can either modify supplied example config files (`config/common.json`) or use zero-config's functionality to override select values using command-line parametrs.
* Configure Graphite paths. You can use variable substitution using `{var}` tags inside paths and variables themselves, as long as there are no circular dependencies.
* Configure `grafana.url` and `grafana.cookie` with your Grafana endpoint and auth-cookie.
* Run `NODE_ENV=development node gen-dashboard.js [path to where your config dir is]`
* Alternatively using command-line parameters: `NODE_ENV=development node gen-dashboard.js [path to where your config dir is] --grafana.url=yoururl --grafana.cookie=auth-cookie=yourcookie --gen-dashboard.variable.dc=yourdc`.
