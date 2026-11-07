import asyncio, json, pathlib, tempfile, time, unittest
from types import SimpleNamespace
import jwt
from hindsight_api.extensions.tenant import AuthenticationError
from tenant_extension import EWorkTenantExtension

class TenantTests(unittest.TestCase):
    def setUp(self):
        self.directory=tempfile.TemporaryDirectory();self.root=pathlib.Path(self.directory.name)
        self.key='synthetic-signing-key-'*4
        (self.root/'key').write_text(self.key)
        (self.root/'registry.json').write_text(json.dumps({'users':[{'id':'User-A'},{'id':'user-a'},{'id':'user-b'}]}))
        self.ext=EWorkTenantExtension({'signing_key_file':str(self.root/'key'),'registry_path':str(self.root/'registry.json')})
    def tearDown(self): self.directory.cleanup()
    def token(self,**overrides):
        now=int(time.time());claims={'sub':'user-a','iss':'ework-memory-gateway','aud':'hindsight-backend','iat':now,'exp':now+30}
        claims.update(overrides);return jwt.encode(claims,self.key,algorithm='HS256')
    def authenticate(self,token):
        return asyncio.run(self.ext.authenticate(SimpleNamespace(api_key=token,extra_headers={'x-user-id':'user-b'})))
    def test_distinct_registered_users_have_distinct_schemas(self):
        schemas=[self.authenticate(self.token(sub=u)).schema_name for u in ['User-A','user-a','user-b']]
        self.assertEqual(len(set(schemas)),3)
        self.assertTrue(all(s.startswith('ewmem_') for s in schemas))
        self.assertNotIn('public',schemas)
    def test_invalid_unknown_expired_and_wrong_audience_are_denied(self):
        for token in [None,'invalid',self.token(sub='unknown'),self.token(exp=int(time.time())-5),self.token(aud='elsewhere'),self.token(iss='elsewhere')]:
            with self.subTest(token_kind=str(type(token))),self.assertRaises(AuthenticationError): self.authenticate(token)
    def test_forged_signature_and_unsigned_tokens_are_denied(self):
        valid=self.token();parts=valid.split('.');parts[2]='AAAA'
        for token in ['.'.join(parts),jwt.encode({'sub':'user-a'},key='',algorithm='none')]:
            with self.assertRaises(AuthenticationError):self.authenticate(token)
    def test_worker_tenants_use_the_same_registered_namespaces(self):
        tenants=asyncio.run(self.ext.list_tenants())
        self.assertEqual({t.schema for t in tenants},{self.authenticate(self.token(sub=u)).schema_name for u in ['User-A','user-a','user-b']})

if __name__=='__main__': unittest.main()
