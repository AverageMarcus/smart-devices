const WIFI_NAME = "";
const WIFI_KEY = "";
const MQTT_HOST = "";
const MQTT_PORT = "";
const MQTT_USER = "";
const MQTT_PASS = "";
const DEVICE_NAME = "";
const LED_COUNT = 44;

const Clock = require("clock").Clock;
var clk = new Clock();
const wifi = require("Wifi");
const http = require("http");
var mqtt;
var intervalId;

var configTopic = `homeassistant/light/${DEVICE_NAME}_Light/config`;
var rootTopic = `custom/light/${DEVICE_NAME}_Light`;
var config = {
  "~": rootTopic,
  "cmd_t": "~/set",
  "stat_t": "~/state",
  "device": {
    "manufacturer": "Espruino",
    "model": "WiFi",
    "identifiers": getSerial(),
    "sw_version": "0.0.1",
    "name": `${DEVICE_NAME}_Light`
  },
  "name": `${DEVICE_NAME}_Light`,
  "schema": "json",
  "unique_id": getSerial(),
  "effect": true,
  "effect_list": ["none", "chaser", "random", "disco"],
  "rgb": true
};

var lastSeenIntervalId;
var state = {
  "last_seen": clk.getDate().toISOString(),
  "color":{"r":0,"g":0,"b":0},
  "state":"OFF"
};

function updateLight() {
  var ledArr = new Uint8ClampedArray(LED_COUNT*3);
  var r = state.color.r;
  var g = state.color.g;
  var b = state.color.b;

  if (state.state === "OFF") {
    r = g = b = 0;
  } else if (r == 0 && g == 0 && b == 0) {
    r = g = b = 255;
    state.color.r = state.color.g = state.color.b = 255;
  }

  if (intervalId) clearInterval(intervalId);

  switch(state.effect) {
    case "chaser":
      var pos = 0;
      var getPattern = function() {
          pos = (pos + 1) % LED_COUNT;
          ledArr[pos * 3 + 0] = g;
          ledArr[pos * 3 + 1] = r;
          ledArr[pos * 3 + 2] = b;

          for(var i = 0; i < LED_COUNT * 3; i++) {
            ledArr[i] *= 0.9;
          }

          return ledArr;
      };
      intervalId = setInterval(function() {
        require("neopixel").write(B15, getPattern());
      }, 50);
      break;
    case "disco":
      var getPattern = function() {
        r = Math.floor(Math.random() * 256);
        g = Math.floor(Math.random() * 256);
        b = Math.floor(Math.random() * 256);
        for(var i=0;i<ledArr.length;) {
          ledArr[i++] = g;
          ledArr[i++] = r;
          ledArr[i++] = b;
        }
        return ledArr;
      };
      intervalId = setInterval(function() {
        require("neopixel").write(B15, getPattern());
      }, 200);
      break;
    case "random":
      r = Math.floor(Math.random() * 256);
      g = Math.floor(Math.random() * 256);
      b = Math.floor(Math.random() * 256);
    default:
      for(var i=0;i<ledArr.length;) {
        ledArr[i++] = g;
        ledArr[i++] = r;
        ledArr[i++] = b;
      }
      require("neopixel").write(B15, ledArr);
      break;
  }
}

function setState(newState) {
  state = Object.assign(state, newState);
  updateLight();
  state.last_seen = clk.getDate().toISOString();
  mqtt.publish(rootTopic + "/state", JSON.stringify(state));
}

function onConnect() {
  console.log("MQTT connected");
  // Expose capabilities to HomeAssistant
  mqtt.publish(configTopic, JSON.stringify(config), { retain: true });
  // watch for updates
  mqtt.subscribe(rootTopic + "/set");
  console.log("Subscribed");
  setState(state);

  lastSeenIntervalId = setInterval(function() {
    state.last_seen = clk.getDate().toISOString();
    mqtt.publish(rootTopic + "/state", JSON.stringify(state));
  }, 60*1000);
}

function onDisconnect() {
  console.log("MQTT disconnected");
  clearInterval(lastSeenIntervalId);
  mqtt.connect();
}

function onMessage(pub) {
  console.log("MQTT => ", pub.message);
  var msg = JSON.parse(pub.message);
  setState(msg);
}

function onInit() {
  console.log("Connecting to WiFi");
  wifi.connect(WIFI_NAME, { password : WIFI_KEY }, function(err) {
    if (err) {
      console.log("WiFi Connection error: "+err);
      return setTimeout(onInit, 1000);
    }
  });

  wifi.on('connected', function() {
    console.log("Connected to WiFi");

    http.get("http://www.espruino.com", function(res) {
      clk = new Clock(res.headers.Date);

      console.log("Connecting to MQTT");
      mqtt = require("MQTT").connect({
        host: MQTT_HOST,
        port: MQTT_PORT,
        username: MQTT_USER,
        password: MQTT_PASS
      });
      mqtt.on('connected', onConnect);
      mqtt.on('publish', onMessage);
      mqtt.on("disconnected", onDisconnect);
    });
  });

  wifi.on('disconnected',function() {
    console.log("WiFi disconnected");
    return setTimeout(onInit, 1000);
  });

}
