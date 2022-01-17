'use strict';

const express = require('express');
const { Server } = require('ws');

const PORT = process.env.PORT || 3000;
const INDEX = '/index.html';

const server = express()
  .use((req, res) => res.sendFile(INDEX, { root: __dirname }))
  .listen(PORT, () => console.log(`Listening on ${PORT}`));

const wss = new Server({ server });

const version = "0.16";

var players = [];
var hosts = [];

const use_test_id = false;

console.log("I LIVE");

setInterval(send_pulse, 1000);

const millis_to_consider_client_unresponsive = 4000

wss.on('connection', function connection(ws) {
  console.log("CONNECTION");

  let this_player = null; //the player asscociated with this connection

  ws.on('message', function incoming(message) {
    //console.log('received: %s', message);

    let msg = JSON.parse(message)
    console.log("i got:"+msg.type);
    if (this_player != null){
      console.log(" for player "+this_player.controller_num+(this_player.is_host ? " (host)" : "")+ " in room "+this_player.room_id)
    }

    //a lot of incoming messages want to know the host, so just fetch that
    //this may be null
    let host = get_host(msg.room);

    //if we have a player for this web socket, mark the time
    if (this_player != null){
      this_player.last_message_time =  Date.now();
    }

    //host joining
    if (msg.type === "create_room"){
      //if the version number is not present or does not match, reject it
      if (msg.version != version){
        console.log("can't join host. wrong verison number. Expected:"+version+" got:"+msg.version);
        ws.send("host_join_failed$Please update to version "+version);
        return;
      }

      let room_id = msg.room_id;
      if (room_id == null)  room_id = get_new_room_id();

      let scene_name = msg.scene_name;
      if (scene_name == null) scene_name = "character_select";

      let player = {
        is_host : true,
        room_id : room_id,
        ws : ws,
        controller_num : 0,
        max_num_players : msg.num_players,
        num_clients : get_clients(room_id).length,
        scene : scene_name,
        last_message_time :  Date.now()
      }
      console.log("created room: "+player.room_id+" which has "+player.num_clients+" clients and max "+player.max_num_players+" players");
      players.push(player);
      hosts.push(player);
      this_player = player;

      //send confirmation
      player.ws.send("room_created$"+room_id);
    }

    //client joining
    if (msg.type === "join_client"){

      //if the version number is not present or does not match, reject it
      if (msg.version != version){
        console.log("can't join client. wrong verison number");
        ws.send("client_join_failed$Please update to version "+version);
        return;
      }

      //did they already have a controller number?
      //this will happen if connection gets interupted for an in-progress game
      let controller_num = -1;
      let is_audience = false;
      if (msg.controller){
        controller_num = msg.controller;
        //on a reconnect, the host may have lost the number of conected clients
        if (host != null){
          if (host.num_clients < controller_num){
            host.num_clients = controller_num;
          }
        }
      }
      //if there was no set controller number, this is a new player, and there are a few reasons why we might reject them
      else{
        if (host == null){
          console.log("can't join client. no host for this room");
          ws.send("client_join_failed$No game found with that ID");
          return;
        }

        if (host.num_clients >= host.max_num_players-1){
          console.log("host has "+host.num_clients+" so set as audience");
          is_audience = true;
          //console.log("can't join client. room is full");
          //ws.send("client_join_failed$Room full");
          //return;
        }

        //if we're keeping them, get them a controller number
        host.num_clients++;
        if (!is_audience){
          controller_num = host.num_clients;
        }
      }

      //if a client reconnects, there could be no host and we should reject them
      if (host == null){
        console.log("can't join client. no host for this room was found");
        ws.send("client_join_failed$No host");
        return;
      }

      let player = {
        is_host : false,  //msg.is_host == "True",
        host : host,
        room_id : msg.room,
        ws : ws,
        controller_num : controller_num,
        is_audience : is_audience,
        last_message_time :  Date.now()
      }
      console.log("new client player here. room:"+player.room_id+"  controller: "+player.controller_num+" audience: "+player.is_audience +" on scene "+host.scene);
      players.push(player);
      console.log("num players:"+players.length);
      this_player = player;

      //send confirmation
      player.ws.send("client_joined$"+player.controller_num+"|"+host.max_num_players+"|"+host.scene+"|"+player.is_audience);
      //let the host know
      host.ws.send("host_got_client$"+host.num_clients);
    }

    //holding down or releasing the special button just gets sent to eveyrbody in the room
    if (msg.type === "special_held"){
      players.forEach( player => {
        if (player.room_id == msg.room && player.ws != ws){
          player.ws.send("special_held$"+msg.raw_text);
        }
      })
    }

    //are we supposed to just pass this along to clients?
    if (msg.broadcast_to_clients){
      let clients = get_clients(msg.room);
      //console.log("just passing this to "+clients.length+" clients");
      clients.forEach( client => {
        client.ws.send(msg.type+"$"+msg.raw_text);
      })
    }

    //TODO: this should just be a broadcast to clients message
    if (msg.type === "board"){
      let room_id = msg.room;
      //console.log("got a board for room:"+room_id);

      //find all clients for that room and send it
      //TODO: use get_clients
      let test_count = 0;
      players.forEach( player => {
        if (player.room_id == room_id && !player.is_host){
          player.ws.send("board$"+msg.raw_text);
          test_count++;
        }
      })
      //console.log("sent board to "+test_count+" clients");
    }

    if (msg.type === "input"){
      if (host != null){
        host.ws.send("input$"+msg.raw_text);
      }
      else{
        console.log("BAD! NO HOST FOUND")
      }
    }

    if (msg.type === "request_verbose"){
      if (host != null){
        host.ws.send("request_verbose");
      }else{
        console.log("no host for room:"+msg.room);
      }
    }

    //check if this had any info we should be storing
    if (host != null){
      if (msg.scene){
        host.scene = msg.scene; 
      }
      //console.log("host on scene:"+host.scene);
    }

  });


  ws.on('close', function() {
    console.log('Client disconnected');
    //find them and kill them
    for (let i=players.length-1; i>=0; i--){
      if (players[i].ws == ws){
        //if they were the host, remove them from the host list too
        if (players[i].is_host){
          for (let k=hosts.length-1; k>=0; k--){
            if (hosts[k] == players[i]){
              hosts.splice(k,1);
              console.log("  killed host. "+hosts.length+" hosts remain");
            }
          }
        }
        //if they belonged to a host change num_clients for that host
        if (players[i].host != null){
          players[i].host.num_clients--;
          console.log("  host for this game now has "+players[i].host.num_clients+" clients");
        }

        //remove them from players list
        players.splice(i,1);
        console.log("  killed player. "+players.length+" players remain");
        return;
      }
    }
  });


});

function get_clients(room_id){
  let list = [];
  players.forEach( player => {
    if (player.room_id == room_id && !player.is_host){
      list.push(player);
    }
  })
  return list;
}
function get_host(room_id){
  let val = null
  hosts.forEach( player => {
    if (player.room_id == room_id){
      val = player;
      return val;
    }
  })
  return val;
}


function get_new_room_id(){
  if (use_test_id)  return "TEST";  //testing lol

  let letters = "ABCDEFGHJKLMNPQRSTUVWXYZ"; //removed I since it can be hard to read

  let valid = false;
  let num_tries = 0

  while (!valid){
    let code = "";
    
    //build it
    for (let i=0; i<4; i++){
      let rand_id = Math.floor(Math.random() * letters.length);
      code += letters.charAt(rand_id);
    }

    //test it against all current hosts
    valid = true;
    hosts.forEach( host =>{
      if (host.room_id == code){
        valid = false;
      }
    })

    //if it's good return it
    if (valid){
      return code;
    }

    //if we tried too many times, bail
    if (num_tries > 1000){
      return "FAILED";
    }
  }
}

//sending out a constant ping so the Unity project can know something is wrong if it hasn't gotten any message for a bit
//TODO: this could update clients on the timer maybe
function send_pulse(){

  //keeping track of clients with no host so we can send them a special pulse
  players.forEach(player => {
    player.found_host = false;
  })

  hosts.forEach(host => {

    //get all of the clients
    let clients = get_clients(host.room_id);

    let num_responsive_clients = 0;
    //send clients a regular pulse and check how long it has been since we've heard from them
    for(let i=0; i<clients.length; i++){
      //if we have a host and they have recently sent a message, we're good
      let host_millis = Date.now() - host.last_message_time
      console.log("host response time: "+host_millis)
      if (host_millis <= millis_to_consider_client_unresponsive){
        clients[i].ws.send("pulse");
        clients[i].found_host = true;
      }
      //otherwise even though we still have a host, they are unrepsonve
      else{
        clients[i].found_host = false;
      }

      //only care about unresponsiveness from people actually playing
      if (!clients[i].is_audience){
        let millis = Date.now() - clients[i].last_message_time
      
        if (millis < millis_to_consider_client_unresponsive){
         num_responsive_clients++;
        }
      }
    }

    let full_message = "pulse";
    host.ws.send("pulse$"+num_responsive_clients.toString());
    


  })

  //send pulse to orphan clients
  players.forEach(player => {
    if (!player.is_host && !player.found_host){
      player.ws.send("no_host_pulse");
    }
  })

  /*
  players.forEach(player => {
    if(player.ws != null){
      console.log("player "+player.controller_num+" time")
      console.log(player.last_message_time)
      player.ws.send("pulse");
    }
  })
  */
}