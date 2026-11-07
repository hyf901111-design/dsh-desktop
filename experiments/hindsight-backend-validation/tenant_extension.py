"""Private-engine authentication. Only the gateway can issue user assertions."""
import hashlib
import json
from pathlib import Path
import jwt
from hindsight_api.extensions.tenant import AuthenticationError, Tenant, TenantContext, TenantExtension

class EWorkTenantExtension(TenantExtension):
    def __init__(self, config):
        super().__init__(config)
        self.key=Path(config['signing_key_file']).read_text().strip()
        if len(self.key)<32: raise ValueError('Private signing key is too short')
        self.registry_path=Path(config['registry_path'])
        self.users()

    def users(self):
        users=json.loads(self.registry_path.read_text())['users']
        ids=[u['id'] for u in users]
        if any(not isinstance(u,str) or not u or len(u)>128 for u in ids) or len(set(ids))!=len(ids):
            raise ValueError('Invalid provisioned-user registry')
        return set(ids)

    @staticmethod
    def schema(user_id):
        return 'ewmem_'+hashlib.sha256(user_id.encode()).hexdigest()[:24]

    async def authenticate(self, context):
        try:
            token=context.api_key
            if not isinstance(token,str) or len(token)>4096: raise ValueError('Missing assertion')
            claims=jwt.decode(token,self.key,algorithms=['HS256'],issuer='ework-memory-gateway',audience='hindsight-backend',
                              options={'require':['sub','iat','exp','iss','aud']})
            if claims['exp']-claims['iat']>30 or claims['sub'] not in self.users(): raise ValueError('Invalid assertion scope')
            return TenantContext(schema_name=self.schema(claims['sub']))
        except (ValueError,TypeError,KeyError,jwt.PyJWTError):
            raise AuthenticationError('Invalid user assertion') from None

    async def list_tenants(self):
        return [Tenant(schema=self.schema(user),tenant_id=user) for user in sorted(self.users())]
