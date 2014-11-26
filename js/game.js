$(document).ready(function() {
	socket = io.connect('http://localhost:8080');
	//socket = io.connect('192.168.1.7:8080');
	//socket = io.connect('67.183.141.131:8080');
	
	var canvas = document.getElementById('paper');
	var context = canvas.getContext('2d');
	var p = new paper({
		x: 0,
		y: 0,
		width: canvas.width,
		height: canvas.height
	}, context, canvas);
	$("#timer_window").hide();
	$("#preround_window").hide();
	$("#drawer_controls").hide();
	
	var name;
	var team;
	var drawer = false;
	
	socket.on('handshake', function (game) {
		//get name or choose from existing ones
		name = Date.now()
		socket.emit('join', name);
	});
	
	socket.on('update_stroke', function(pos) {
		p.draw(pos);
	});
	
	socket.on('start_stroke', function() {
		p.startStroke();
	});
	
	socket.on('end_stroke', function() {
		p.endStroke();
	});
	
	socket.on('clear', function() {
		p.clear();
	});
	
	socket.on('new_word', function(game) {
		$("#word").text = game.word;
	});
	
	socket.on('wait', function() {
		setMessage("Welcome! We're waiting for more players");
	});
	
	socket.on('start_game', function(game) {
		game.team1.players.forEach(function(player) {
			if (player != name) {
				$("#team1_list").append("<li>" + player + "</li>");
			} else {
				team = 1;
			}
		});
		
		game.team2.players.forEach(function(player) {
			if (player != name) {
				$("#team2_list").append("<li>" + player + "</li>");
			} else {
				team = 2;
			}
		});
		
		if (game.drawer == name) {
			$("#word").text = game.word;
			$("#preround_window").show();
			setMessage("Look at your word and get ready to draw");
		} else {
			setMessage("Waiting for the artist to pick their word");
		}
	});
	
	socket.on('join_game', function(game) {
		
	});
	
	socket.on('start_round', function(game) {
		if (game.drawer == name) {
			setMessage("Start drawing");
			$("#drawer_controls").show();
			p.enable();
		} else if ((game.turn1 && game.team1.players.indexOf(name) < 0) || (!game.turn1 && game.team2.players.indexOf(name) < 0)) {
			$("#word").text = game.word;
			setMessage("Don't give the word away");
		}
		$("#preround_window").hide();
		$("#timer_window").show();
	});
	
	socket.on('end_round', function(game) {
		$("#timer_window").hide();
		$("#preround_window").hide();
		$("#drawer_controls").hide();
		$("#word").text = "?";
		
		if (game.drawer == name) {
			$("#word").text = game.word;
			$("#preround_window").show();
			setMessage("Look at your word and get ready to draw");
		} else {
			setMessage("Waiting for the artist to pick their word");
		}
	});
	
	//the drawing window and all the self-contained code
	function paper(dim, con, canv) {
		var lastPos;
		var drawing = false;
		var enabled = false;
		
		this.draw = function(pos) {
			//draw the first line in every stroke with length zero by doubling up the first point in every stroke
			if (!lastPos)
				lastPos = pos;
				
			con.beginPath();
			con.moveTo(lastPos.x, lastPos.y);
			con.lineTo(pos.x, pos.y);
			con.lineWidth = 4;
			context.strokeStyle = 'black';
			con.stroke();
			con.closePath();
			
			//update the last position for next time
			lastPos = pos;
		}
		var draw = this.draw;
		
		this.drawAll = function(strokes) {
			
		}
		
		this.clear = function() {
			//blank the canvas
			con.clearRect(dim.x, dim.y, dim.width, dim.height);
			
			lastPos = undefined;
			
			//draw the blue lines back on first
			for (var i = 0; i < dim.height; i += 20) {
				con.beginPath();
				con.moveTo(0, i);
				con.lineTo(dim.width, i);
				context.strokeStyle = '#0000dd';
				con.lineWidth = 1;
				con.stroke();
				con.closePath();
			}
		}
		
		this.startStroke = function() {
			drawing = true;
		}
		
		this.endStroke = function() {
			lastPos = undefined
			drawing = false;
		}
		var endStroke = this.endStroke;
		
		this.disable = function() {
			enabled = false;
		}
		
		this.enable = function() {
			enabled = true;
		}
		
		function getMousePos(canv, evt) {
			var rect = canv.getBoundingClientRect();
			return {
			  x: evt.clientX - rect.left,
			  y: evt.clientY - rect.top
			};
		}
		
		canv.addEventListener('mousemove', function(evt) {
			var mousePos = getMousePos(canv, evt);
			console.log(enabled + "," + drawing);
			if (enabled && drawing) {
				draw(mousePos);
				socket.emit("update_stroke", mousePos);
			}
		}, false);
		
		canv.addEventListener('mousedown', function(evt) {
			if (enabled) {
				drawing = true;
				socket.emit("start_stroke");
			}
		}, false);
		
		canv.addEventListener('mouseup', function(evt) {
			if (enabled) {	
				endStroke();
				socket.emit("end_stroke");
			}
		}, false);
		
		canv.addEventListener('mouseout', function(evt) {
			if (enabled) {
				endStroke();
				socket.emit("end_stroke");
			}
		}, false);
		
		this.clear();
	}
	
	function endGame() {
	
	}
	
	function setMessage(message) {
		$("#message").text(message);
	}
	
	$("#clear").click(function(evt) {
		p.clear();
		socket.emit("clear");
	});
	
	$("#start_round").click(function() {
		setMessage("Start drawing");
		$("#won_round").show();
		p.enable();
		$("#preround_window").hide();
		$("#timer_window").show();
		socket.emit('start_round');
	})
});