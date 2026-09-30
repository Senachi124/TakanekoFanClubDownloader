"""Read only SERVICES_DOMAIN from home .env; render this service's endpoints."""
from pathlib import Path
import re
import os


def services_domain(path=None):
    path = Path(path or os.environ['TAKANEKO_DOMAIN_FILE'])
    values = []
    for line in path.read_text().splitlines():
        match = re.fullmatch(r'\s*(?:export\s+)?SERVICES_DOMAIN\s*=\s*([^#]+?)(?:\s+#.*)?\s*',line)
        if match: values.append(match[1].strip().strip('\"\''))
    if len(values)!=1 or not re.fullmatch(r'[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?',values[0]):
        raise ValueError('Exactly one valid SERVICES_DOMAIN is required in home .env')
    return values[0]


if __name__=='__main__':
    domain = services_domain()
    config = Path('/etc/takaneko')
    (config/'runtime.env').write_text(f'TAKANEKO_ORIGIN=https://{domain}:2083\nTAKANEKO_HOME_URL=https://{domain}/\n')
    (config/'runtime.env').chmod(0o640)
    template = Path(__file__).with_name('nginx.conf').read_text()
    (config/'nginx.conf').write_text(template.replace('__SERVICES_DOMAIN__',domain))
