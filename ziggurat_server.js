'use strict';

const express = require('express');
const { Server } = require('ws');

const PORT = process.env.PORT || 3000;
const INDEX = '/index.html';

const server = express()
  .use((req, res) => res.sendFile(INDEX, { root: __dirname }))
  .listen(PORT, () => console.log(`Listening on ${PORT}`));

const wss = new Server({ server });

const version = "0.12";

var players = [];
var hosts = [];

const use_test_id = false;

console.log("I LIVE");

setInterval(send_pulse, 1000);

wss.on('connection', function connection(ws) {
  console.log("CONNECTION");

  //ws.send("Hello new friend");

  ws.on('message', function incoming(message) {
    //console.log('received: %s', message);

    let msg = JSON.parse(message)
    console.log("i got:"+msg.type);

    //a lot of incoming messages want to know the host, os just fetch that
    //this may be null
    let host = get_host(msg.room);

    //host joining
    if (msg.type === "create_room"){
      //if the version number is not present or does not match, reject it
      if (msg.version != version){
        console.log("can't join host. wrong verison number. Expected:"+version+" got:"+msg.version);
        ws.send("host_join_failed$Please update to version "+version);
        return;
      }

      let room_id = get_new_room_id();
      let player = {
        is_host : true,
        room_id : room_id,
        ws : ws,
        max_num_players : msg.num_players,
        num_clients : get_clients(room_id).length,
        scene : "character_select"
      }
      console.log("created room: "+player.room_id+" which has "+player.num_clients+" clients and max "+player.max_num_players+" players");
      players.push(player);
      hosts.push(player);

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
        room_id : msg.room,
        ws : ws,
        controller_num : controller_num,
        is_audience : is_audience
      }
      console.log("new client player here. room:"+player.room_id+"  controller: "+player.controller_num+" audience: "+player.is_audience);
      players.push(player);
      console.log("num players:"+players.length);

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
      console.log("just passing this to "+clients.length+" clients");
      clients.forEach( client => {
        client.ws.send(msg.type+"$"+msg.raw_text);
      })
    }

    //TODO: this should just be a broadcast to clients message
    if (msg.type === "board"){
      let room_id = msg.room;
      console.log("got a board for room:"+room_id);

      //find all clients for that room and send it
      //TODO: use get_clients
      let test_count = 0;
      players.forEach( player => {
        if (player.room_id == room_id && !player.is_host){
          player.ws.send("board$"+msg.raw_text);
          test_count++;
        }
      })
      console.log("sent board to "+test_count+" clients");
    }

    if (msg.type === "input"){
      //TODO: use get_players
      //find the host and sent it their way
      players.forEach( player => {
        if (player.room_id == msg.room && player.is_host){
          player.ws.send("input$"+msg.raw_text);
          console.log("sent:"+msg.raw_text);
        }
      })
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

      console.log("host on scene:"+host.scene);
    }

  });


  ws.on('close', function() {
    console.log('Client disconnected');
    //find them and kill them
    for (let i=players.length-1; i>=0; i--){
      if (players[i].ws == ws){
        //if they were the host, remove them from te host list too
        if (players[i].is_host){
          for (let k=hosts.length-1; k>=0; k--){
            if (hosts[k] == players[i]){
              hosts.splice(k,1);
              console.log("  killed host. "+hosts.length+" hosts left remain");
            }
          }
        }

        //rmeove them from players list
        players.splice(i,1);
        console.log("  killed player. "+players.length+" players left remain");
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

//sending out a constant ping so the Unity project can know somehting is wrong if it hasn't gotten any message for a bit
//TODO: this could update clients on the timer maybe
function send_pulse(){
  players.forEach(player => {
    if(player.ws != null){
      player.ws.send("pulse");
    }
  })
}