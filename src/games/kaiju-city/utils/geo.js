/**
 * Geographic utilities: lat/lng to local meter coordinates.
 * Uses a simple tangent plane approximation centered on a reference point.
 */

const METERS_PER_DEGREE_LAT = 111319.9;

export class GeoProjection {
  /**
   * @param {number} centerLat - reference latitude (degrees)
   * @param {number} centerLng - reference longitude (degrees)
   */
  constructor(centerLat, centerLng) {
    this.centerLat = centerLat;
    this.centerLng = centerLng;
    this.cosLat = Math.cos(centerLat * Math.PI / 180);
  }

  /** Convert lat/lng to local meters (x = east, z = north) */
  toLocal(lat, lng) {
    return {
      x: (lng - this.centerLng) * this.cosLat * METERS_PER_DEGREE_LAT,
      z: -(lat - this.centerLat) * METERS_PER_DEGREE_LAT, // negative because z = south in Three.js
    };
  }

  /** Convert local meters back to lat/lng */
  toLatLng(x, z) {
    return {
      lat: this.centerLat + (-z / METERS_PER_DEGREE_LAT),
      lng: this.centerLng + (x / (this.cosLat * METERS_PER_DEGREE_LAT)),
    };
  }
}
