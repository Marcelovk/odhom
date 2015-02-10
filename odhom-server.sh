echo === starting odhom-server ======= >>odhom.log
node server.js >>odhom.log
echo Running, node.js pid is $!
wait $!
./odhom-server.sh
