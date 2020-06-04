const { Datastore } = require('@google-cloud/datastore');
module.exports.datastore = new Datastore({
  'grpc.max_send_message_length': -1,
  'grpc.max_receive_message_length': -1,
});
module.exports.getId = (item) => {
  return item[Datastore.KEY].id;
};
