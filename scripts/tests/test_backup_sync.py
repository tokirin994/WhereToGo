import importlib.util,io,json,os,pathlib,tempfile,time,unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('backup',pathlib.Path(__file__).parents[2]/'scripts/pull-vps-backups.py');backup=importlib.util.module_from_spec(spec);spec.loader.exec_module(backup)
class Stream(io.BytesIO):
 @property
 def channel(self):return self
 def recv_exit_status(self):return 0
class FakeClient:
 payload=b'age-encryption.org/v1\n'+b'Encrypted data placeholder'
 name='20261028T000000Z.tar.age'
 stale=False
 bad_hash=False
 unsafe=False
 def load_host_keys(self,*args):pass
 def set_missing_host_key_policy(self,*args):pass
 def connect(self,*args,**kwargs):pass
 def close(self):pass
 def exec_command(self,command,**kwargs):
  name='../bad' if self.unsafe else self.name
  row={'name':name,'size':len(self.payload),'modified':int(time.time())-(200000 if self.stale else 0)}
  if command=='list':data=json.dumps([row]).encode()
  elif command.startswith('stat '):data=json.dumps({**row,'sha256':'bad' if self.bad_hash else backup.hashlib.sha256(self.payload).hexdigest()}).encode()
  else:data=self.payload
  return io.BytesIO(),Stream(data),io.BytesIO()
class BackupTests(unittest.TestCase):
 def run_pull(self,fake):
  with tempfile.TemporaryDirectory() as directory:
   config={'destination':directory,'knownHosts':'known','host':'server','port':22,'statusFile':str(pathlib.Path(directory)/'status.json')}
   with patch.object(backup.paramiko,'SSHClient',return_value=fake),patch.object(backup.paramiko.Ed25519Key,'from_private_key',return_value=object()),patch.dict(os.environ,{'WTG_BACKUP_PRIVATE_KEY':'not-a-real-key'}):backup.pull(config)
   self.assertTrue((pathlib.Path(directory)/fake.name).is_file());self.assertFalse((pathlib.Path(directory)/(fake.name+'.partial')).exists())
 def test_successful_encrypted_download(self):self.run_pull(FakeClient())
 def test_rejects_stale_archive(self):
  fake=FakeClient();fake.stale=True
  with self.assertRaisesRegex(RuntimeError,'stale'):self.run_pull(fake)
 def test_rejects_transfer_hash_mismatch(self):
  fake=FakeClient();fake.bad_hash=True
  with self.assertRaisesRegex(RuntimeError,'SHA-256'):self.run_pull(fake)
 def test_rejects_unsafe_manifest_names(self):
  fake=FakeClient();fake.unsafe=True
  with self.assertRaisesRegex(RuntimeError,'manifest'):self.run_pull(fake)
 def test_rejects_unencrypted_archive(self):
  fake=FakeClient();fake.payload=b'plain text database dump'
  with self.assertRaisesRegex(RuntimeError,'encrypted'):self.run_pull(fake)
if __name__=='__main__':unittest.main()
