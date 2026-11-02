/* fx-address-init.r1.js — declarative bootstrap for the address cascade.
   Scans for [data-fx-addr] hosts and wires an AddressBlock for each.

   Markup contract (on the country slot's container):
     <div id="shp-from-country-host"
          data-fx-addr="shp-from"        <- id prefix
          data-fx-addr-key="from"        <- key on window.FX_ADDR
          data-fx-addr-label="Country">  <- accessible name
     </div>

   Derived ids:
     <prefix>-state-host        container for the state slot
     <prefix>-state             <select>  (list countries)
     <prefix>-state-text        <input>   (free-text fallback)
     <prefix>-zip               postcode <input>
     err-<prefix>-state         state error node
     err-<prefix>-zip           postcode error node
*/
(function () {
  'use strict';

  function boot() {
    if (!window.FXAddress) return;

    var hosts = document.querySelectorAll('[data-fx-addr]');
    if (!hosts.length) return;

    window.FX_ADDR = window.FX_ADDR || {};

    for (var i = 0; i < hosts.length; i++) {
      var host = hosts[i];
      var prefix = host.getAttribute('data-fx-addr');
      var key = host.getAttribute('data-fx-addr-key') || prefix;

      // Avoid double-wiring if the script is included twice.
      if (host.getAttribute('data-fx-addr-ready') === '1') continue;
      host.setAttribute('data-fx-addr-ready', '1');

      var block = new window.FXAddress.AddressBlock({
        prefix: prefix,
        countryHost: host.id,
        countryName: key + 'Country',
        countryLabel: host.getAttribute('data-fx-addr-label') || 'Country',
        stateHost: prefix + '-state-host',
        stateSelectId: prefix + '-state',
        stateTextId: prefix + '-state-text',
        stateName: key + 'State',
        stateErrorId: 'err-' + prefix + '-state',
        stateWord: 'state or region',
        postcodeHost: prefix + '-zip-host',
        postcodeId: prefix + '-zip',
        postcodeErrorId: 'err-' + prefix + '-zip'
      });

      window.FX_ADDR[key] = block;
    }

    document.documentElement.setAttribute('data-fx-address-ready', '1');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
