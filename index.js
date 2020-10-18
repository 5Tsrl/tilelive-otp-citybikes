"use strict"
const geojsonVt = require('geojson-vt')
const vtPbf = require('vt-pbf')
const request = require('requestretry')
const zlib = require('zlib')
const CronJob = require('cron').CronJob

const query = `
  query bikerentals {
    bikeRentalStations {
      stationId
      name
      networks
      lon
      lat
    }
  }`

class GeoJSONSource {


  constructor(uri, callback) {
    // updateTileIndex(uri) {

    const job = new CronJob('*/15 * * * * *', () => {
      this.randomDelay(uri)
      // this.updateTileIndex(uri)
    })
    job.start()

    callback(null, this)
  }

  randomDelay(uri) {
    // call index update with random delay (0-4 s) not to overload otp with n. mapserver instances concurrent queries
    setTimeout(() => {this.updateTileIndex(uri)}, Math.random() * 4000)
  }

  updateTileIndex(uri) {
    uri.protocol = "http:"
    request({
      url: uri,
      body: query,
      maxAttempts: 120,
      retryDelay: 30000,
      method: "POST",
      headers: {
        'Content-Type': 'application/graphql'
      }
    }, (err, res, body) => {
      if (err) {
        console.log(err)
        return
      }

      const geoJSON = {
        type: "FeatureCollection", features: JSON.parse(body).data.bikeRentalStations.map(station => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [station.lon, station.lat] },
          properties: {
            id: station.stationId,
            name: station.name,
            networks: station.networks.join()
          }
        }))
      }

      this.tileIndex = geojsonVt(geoJSON, {
        maxZoom: 20,
        buffer: 256
      }) //TODO: this should be configurable
      console.log("city bikes loaded from:", uri.host + uri.path)
    })
  }


  getTile(z, x, y, callback) {
    let tile
    // protection from early calls, when tileIndex is not yet available
    if(this.tileIndex){
      tile = this.tileIndex.getTile(z, x, y)
    }

    if (!this.tileIndex || tile === null) {
      tile = { features: [] }
    }

    const data = Buffer.from(vtPbf.fromGeojsonVt({ stations: tile }));

    zlib.gzip(data, function (err, buffer) {
      if (err) {
        callback(err)
        return;
      }

      callback(null, buffer, { "content-encoding": "gzip" })
    })
  }

  getInfo(callback) {
    callback(null, {
      format: "pbf",
      vector_layers: [{
        description: "",
        id: "stations"
      }],
      maxzoom: 20,
      minzoom: 1,
      name: "OTP Citybikes"
    })
  }
}

module.exports = GeoJSONSource

module.exports.registerProtocols = (tilelive) => {
  tilelive.protocols['otpcitybikes:'] = GeoJSONSource
}


// git add .; git commit -m 'modifica n. '; git push