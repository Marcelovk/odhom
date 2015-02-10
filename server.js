// Load the http module to create an http server.
var http = require("http");
var sys = require("sys");
var fs = require('fs');
var exec = require("child_process").exec;

// AWS credentials
process.env.AWS_CONFIG_FILE = "./credentials";

//haproxy file contents
var g_haproxy_file_contents = "";

//table with our config and machines managed
var backendsTable = {};

//dictionary pointing to the same objects in backendsTable, but with hostanem as key
var g_dicByHostname = {};

//dictionary pointing to the same objects in backendsTable, but with instanceId as key
var g_dicByInstanceId = {};

//control variable
var bBuildingHaproxyFile = false;

//Maximum time in seconds to wait for ec2 instance to be up and answering before returning 500 (fail).
var MAX_TIMEOUT_MACHINE_ON = 300;

//Time in seconds to shut down the instance if no one has accessed it. 
var TIMEOUT_EXPIRED_MACHINE = 55 * 60 * 1000; //55 minutes

//CriticalSection for exec aws
var g_execIsRunning = {};

function turnOn(hostname)
{
	if (!g_dicByHostname.hasOwnProperty(hostname))
		return;
	
	var instanceId = g_dicByHostname[hostname].instanceid;
	
	if (instanceId !== "")
	{	
		if (g_execIsRunning === true) {console.log("aws is running, aborted"); return;}
		g_execIsRunning = true;
	
		console.log("prevent " + instanceId + " from expiring");
		g_dicByInstanceId[instanceId].timestamp = new Date();	
		
		exec ("aws ec2 start-instances --instance-ids " + instanceId, 
			function (error, stdout, stderr) {		
			g_execIsRunning = false;
			
			try
			{	
				if (error) {console.log("error :" + error);}
				if (stderr) {console.log("stderr :"  + stderr);}
				var info = JSON.parse(stdout);
			
				if (info.StartingInstances[0].CurrentState.Code === 0)
				{
					console.log("starting instance " + info.StartingInstances[0].InstanceId);
				}
				else if (info.StartingInstances[0].CurrentState.Code === 16)
				{
					console.log("instance was already running: " + info.StartingInstances[0].InstanceId);
				}
			}
			catch (err)
			{
				console.log("try_catch_error :" + err);
			}			
		});
	}	
}


function writeLoadingPage(hostname, response, url)
{
	if (!g_dicByHostname.hasOwnProperty(hostname))
	{
		console.log("Attempt to start " + hostname + " failed. Reason: No odhom tag found for it.");
		response.writeHead(200);
		response.write("Attempt to start " + hostname + " failed. Reason: No odhom tag found for it.");
		response.end();
		return;
	}

	var c, responseTimer;
	c = 0;	
	
	responseTimer = setInterval(
		function ()
		{	
			if (g_dicByHostname.hasOwnProperty(hostname))
			{			
				if (true === g_dicByHostname[hostname].listening) //Backendwaiting is ready
				{	
					console.log(hostname +" is ready, will redirect to haproxy");
					clearInterval(responseTimer);				
					response.writeHead(302, { 'Location': url });				
					response.end();			
				}
				else
				{
					// console.log(hostname +"is waiting to fully boot");
				}
			}
			
				
			if (c>MAX_TIMEOUT_MACHINE_ON) //5 minutes max time to bring machine up
			{
				console.log(hostname + " didnt boot and started to listen until timeout");
				clearInterval(responseTimer);				
				response.writeHead(200);
				response.write(hostname + " timeout.");
				response.end();
			}			
			c+=1;
		}, 
	1000);
}

function dumpBackendTable(response)
{
	response.writeHead(200, {"Content-Type": "application/json"});
	response.end(JSON.stringify(backendsTable, undefined, 2));
}

// Configure our HTTP server to respond with Hello World to all requests.
var server = http.createServer(function (request, response) {

	//just to check if is alive. Used by route53 health check, logs nothing and answers fast.
	if (request.url === "/check")
	{
		response.writeHead(200);
		response.end();
		return;
	}

	//disable robots.txt 
	if (request.url === "/robots.txt")
	{
		response.writeHead(200);
		response.write ("User-agent: *\nDisallow: /");		
		response.end();
		console.log(new Date().toISOString() + "Call to " + request.headers.host + request.url + " ignored" );
		return;
	}
	
	//ignore calls to favicon
	if (request.url === "/favicon.ico")
	{
		response.writeHead(404);
		console.log(new Date().toISOString() + "Call to " + request.headers.host + request.url + " ignored" );
		response.end();
		return;
	}
	
	if (request.url === "/odhom") 
	{
		dumpBackendTable(response);
		response.end(); 
		return;
	}
	
	response.writeHead(200, {"Content-Type": "text/html"});
	console.log (new Date().toISOString() + " access to " + request.headers.host + request.url);
	
	turnOn(request.headers.host); //async
	writeLoadingPage(request.headers.host, response, request.url);//async
	
});


function updateInstanceIdsOnBackendsTable(backend, instanceid, hostname, awsprivatednsname, state)
{
	if (backendsTable[backend] === undefined)
	{
		backendsTable[backend] = {};
		backendsTable[backend].timestamp = new Date();
		backendsTable[backend].listening = false;
	}
	
	backendsTable[backend].instanceid = instanceid;
	backendsTable[backend].hostname = hostname;
	backendsTable[backend].awsprivatednsname = awsprivatednsname;
	backendsTable[backend].state = state;
	
	if (backendsTable[backend].state !== "running")
	{
		backendsTable[backend].listening = false;
	}
}

function clearBackends()
{
	backendsTable = {};
}

function buildHaproxyFile()
{
	if (true === bBuildingHaproxyFile) {return;}

	bBuildingHaproxyFile = true;
	exec ("aws ec2 describe-instances --filter Name=tag:odhom-host,Values=*", function (error, stdout, stderr) {
	 
		var file, i,j,k,machines,backends, stream, hosts, liveBackends, backendName;		
		
		if (error) {console.log("error :" + error);}
		if (stderr) {console.log("stderr: "  + stderr);}
		
		file  = 
					" global                     \r\n"+
					"   daemon                   \r\n"+
					"   maxconn 256              \r\n"+
					"   pidfile ./haproxy.pid    \r\n"+
					"   log-send-hostname        \r\n"+
					"	log 127.0.0.1:8001 local1 \r\n"+
                    "                            \r\n"+
					" defaults                   \r\n"+
					"   mode http                \r\n"+
					"   option httpclose         \r\n"+					
					"   option forwardfor        \r\n"+
					"   timeout connect 5000ms   \r\n"+
					"   timeout client 300000ms   \r\n"+
					"   timeout server 300000ms   \r\n"+
					"	option log-health-checks \r\n"+
					"   log global               \r\n"+
                    "                            \r\n"+
					" frontend http-in           \r\n"+
					"		bind *:80            \r\n"+
					"		option dontlognull   \r\n"+
					"		option logasap       \r\n"+
					"		option httplog       \r\n"+
					" 		default_backend nodejs	 \r\n\r\n";
					
					
		machines = JSON.parse(stdout);
		backends = "";
		liveBackends = {};
		
			
		if (machines.Reservations.length >=1)
		{					
			for (i=0;i<machines.Reservations.length;i+=1)
			{					
				for (j=0;j<machines.Reservations[i].Instances[0].Tags.length; j+=1)
				{					
					if (machines.Reservations[i].Instances[0].Tags[j].Key === "odhom-host")					   
					{
						if ((machines.Reservations[i].Instances[0].Tags[j].Value === null) || 
						    (machines.Reservations[i].Instances[0].Tags[j].Value === undefined))
						{
							//prevent dealing with null and empty odhom-host tags.
							continue;
						}
						
						hosts = machines.Reservations[i].Instances[0].Tags[j].Value.split(",");
						
						for (k=0;k<hosts.length;k+=1)
						{						
							file += "		acl host_" + i + "_" + k +" hdr(host) -i " + hosts[k] + "\r\n";
							file += "		use_backend back_" + machines.Reservations[i].Instances[0].InstanceId + " if host_" + i + "_" + k +"\r\n";
						}
						
						backends += " backend back_" + machines.Reservations[i].Instances[0].InstanceId + "\r\n";						
						
						//if machine is running, then we have the public DNS of it.
						if (machines.Reservations[i].Instances[0].State.Code === 16)
						{
							backends += "		server server1 " + machines.Reservations[i].Instances[0].PrivateDnsName +" port 80 check\r\n";			
						}
						backends += "		server odhom 127.0.0.1:8000 check backup\r\n\r\n";	
						
						
						updateInstanceIdsOnBackendsTable("back_" + machines.Reservations[i].Instances[0].InstanceId + "/server1", 
														machines.Reservations[i].Instances[0].InstanceId,
														machines.Reservations[i].Instances[0].Tags[j].Value, 
														machines.Reservations[i].Instances[0].PrivateDnsName,
														machines.Reservations[i].Instances[0].State.Name);
														
						//save backend name for upkeep, we will remove the ones that disappeared.
						liveBackends["back_"  +machines.Reservations[i].Instances[0].InstanceId + "/server1"] = true;
					}
				}
			}	
				
			//remove machines that were there but does not have the tag odhom-host anymore.
			for (backendName in backendsTable)
			{
				if (backendsTable.hasOwnProperty(backendName))		
				{	
					if (liveBackends[backendName] !== true)
					{
						console.log("deleting " + backendName);
						delete backendsTable[backendName];
					}
				}
			}
			
			//have it on others dictionaries too.
			for (backendName in backendsTable)
			{
				if (backendsTable.hasOwnProperty(backendName))		
				{	
					(function (){
						var o,hostnames;
						hostnames =  backendsTable[backendName].hostname.split(',');
						
						for (o=0;o<hostnames.length;o+=1)
						{
							g_dicByHostname[hostnames[o]] = backendsTable[backendName];
						}	
						
						g_dicByInstanceId[backendsTable[backendName].instanceid] = backendsTable[backendName];
					}());
				}
			}
			
			backends += " backend nodejs             \r\n";
			backends += " 		server odhom 127.0.0.1:8000 check backup\r\n";	
			
			file += backends;
			
			if (g_haproxy_file_contents !== file)
			{			
				console.log("writing odhom-haproxy.cfg");
				//write file
				stream = fs.createWriteStream("./odhom-haproxy.cfg");
				stream.write(file);
				stream.end();
				
				g_haproxy_file_contents = file;
				
				//reload haproxy
				console.log("reloading haproxy");
				exec ("sudo haproxy -f ./odhom-haproxy.cfg -p ./haproxy.pid -sf $(cat ./haproxy.pid)", function (error, stdout, stderr) {				
					if (error) {console.log("error :" + error);}
					if (stderr) {console.log("stderr :"  + stderr);}
					
				});
							
			}
			
		}
		else
		{
			console.log("No odhom-host found, check the tags on your EC2 machines.");
		}
		
		bBuildingHaproxyFile = false;
		
	});	
}

function updateLastAccessTable(backend, timestamp)
{
	if (backendsTable[backend] === undefined)
	{
		backendsTable[backend] = {};
	}

	backendsTable[backend].timestamp = timestamp;
}

function updateUpDown(backend, isUp)
{
	if (backendsTable[backend] === undefined)
	{
		backendsTable[backend] = {};
	}
	
	backendsTable[backend].listening = isUp;
}

var dgram = require('dgram');
var logserver = dgram.createSocket("udp4");

logserver.on("error", function (err) {
  console.log("logserver error:\n" + err.stack);  
});

logserver.on("message", function (msg, rinfo) {		
	var backendfullname,msgstring;
		
	msgstring = msg.toString();	
	if (msgstring.search("GET") !== -1)
	{
		backendfullname = msgstring.match("back.*/server1");
				
		if (backendfullname!==null)
		{
			updateLastAccessTable(backendfullname[0], new Date());
		}
		return;
	}	
	if (
	    (msgstring.search("is DOWN") !== -1) ||						  
	    (msgstring.search("failed, reason: Layer4") !== -1)
	   )
	{
		backendfullname = msgstring.match("back.*/server1");
		
		if (backendfullname!==null)
		{
			//console.log(backendfullname + " is DOWN");
			updateUpDown(backendfullname[0], false);
		}
		return;
	}
	
	if (
		(msgstring.search("is UP") !== -1) || 
	    (msgstring.search(" succeeded, reason: Layer4 check passed") !== -1)
	   )
	{
		backendfullname = msgstring.match("back.*/server1");
		if (backendfullname!==null)
		{
			//console.log(backendfullname + " is UP");
			updateUpDown(backendfullname[0], true);
		}
		return;
	}
});


function onMachineTurnOff(error, stdout, stderr)
{
	g_execIsRunning = false;
	if (error) {console.log("error :" + error);}
	if (stderr) {console.log("stderr :"  + stderr);}

	var output = JSON.parse(stdout);
	
	console.log("new state of " + output.StoppingInstances[0].InstanceId + " is " + output.StoppingInstances[0].CurrentState.Name);
}

function endsWith(str, suffix) {
    return str.indexOf(suffix, str.length - suffix.length) !== -1;
}

function turnOffExpiredMachines()
{
	var backendName, backend;
	for (backendName in backendsTable)
	{
		if (backendsTable.hasOwnProperty(backendName))
		{		
			backend = backendsTable[backendName];
			
			//console.log ("backend " +backend+ " last access was at " + new Date(new Date() - timestamp).getMinutes() + " minutes ago");
			
			if (((new Date() - backend.timestamp) > TIMEOUT_EXPIRED_MACHINE) && 
				(backend.hasOwnProperty('instanceid')) && 
				(backend.state==='running'))
			{
				console.log("instance " + backend.instanceid +" has expired. Shutting it down.");
				
				//prevent it from re-expiring
				backend.timestamp = new Date();
				
				if (g_execIsRunning === true) {console.log("aws is running, aborted"); return;}
					g_execIsRunning = true;
				
				exec ("aws ec2 stop-instances --instance-ids " + backend.instanceid, onMachineTurnOff);
			}
		}
	}
}


//start UDP server to receive haproxy messages. Haproxy will try to send to rsyslogd, but we´ll be listening there
logserver.bind(8001);

// Listen on port 8000, IP defaults to 127.0.0.1
server.listen(8000);

//haproxy thread, every 5 seconds it detects the machines that have 
//the odhom-host tag, and recreates the file if needed.
setInterval(buildHaproxyFile, 5000);

//expirer thread. Every minute, checks if the last access of the machine
//was bigger than 55 minutes. If that is the case, shut it down.
setInterval(turnOffExpiredMachines, 60 * 1000);

// Put a friendly message on the terminal
console.log("Server running at http://127.0.0.1:8000/");
