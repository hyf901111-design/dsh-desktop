"""Isolated, synthetic-only Hindsight service. Never changes application settings."""
import argparse, json, os, pathlib, signal, subprocess, sys, threading, time, urllib.request
import psutil
import yaml
from pg0 import Pg0

p = argparse.ArgumentParser()
p.add_argument('--root', required=True)
p.add_argument('--credentials', required=True)
p.add_argument('--port', type=int, default=19077)
p.add_argument('--label', default='initial')
p.add_argument('--model-path')
p.add_argument('--compact', action='store_true')
a = p.parse_args()
root = pathlib.Path(a.root).resolve()
evidence = root / 'evidence'
evidence.mkdir(parents=True, exist_ok=True)
runtime = root / 'runtime'
credentials = yaml.safe_load(pathlib.Path(a.credentials).read_text())
key = credentials['ZAI_API_KEY']
secrets = [v for v in credentials.values() if isinstance(v, str) and len(v) > 12]
env = dict(os.environ)
env.update({
    'HF_HOME': str(runtime / 'huggingface'), 'HF_HUB_DISABLE_TELEMETRY': '1',
    'HF_HUB_DISABLE_XET': '1',
    'TOKENIZERS_PARALLELISM': 'false', 'HINDSIGHT_API_LLM_PROVIDER': 'openai',
    'HINDSIGHT_API_LLM_BASE_URL': 'https://api.z.ai/api/coding/paas/v4',
    'HINDSIGHT_API_LLM_MODEL': 'GLM-5.3-Flash', 'HINDSIGHT_API_LLM_API_KEY': key,
    'HINDSIGHT_API_LLM_EXTRA_BODY': '{"thinking":{"type":"disabled"}}',
    'HINDSIGHT_API_LLM_MAX_CONCURRENT': '2', 'HINDSIGHT_API_LLM_MAX_RETRIES': '1',
    'HINDSIGHT_API_LLM_TIMEOUT': '90',
    'HINDSIGHT_API_MODEL_INIT_TIMEOUT': '1800',
    'HINDSIGHT_API_EMBEDDINGS_PROVIDER': 'onnx',
    'HINDSIGHT_API_EMBEDDINGS_ONNX_MODEL_ID': 'intfloat/multilingual-e5-small',
    'HINDSIGHT_API_EMBEDDINGS_ONNX_DEVICE': 'cpu',
    'HINDSIGHT_API_RERANKER_PROVIDER': 'rrf',
    'HINDSIGHT_API_ENABLE_AUTO_CONSOLIDATION': 'false',
    'HINDSIGHT_API_ENABLE_OBSERVATIONS': 'false',
    'HINDSIGHT_API_DB_POOL_MIN_SIZE': '1', 'HINDSIGHT_API_DB_POOL_MAX_SIZE': '8',
    'HINDSIGHT_API_OTEL_TRACES_ENABLED': 'false', 'HINDSIGHT_API_MCP_ENABLED': 'false',
})
if a.model_path:
    env['HINDSIGHT_API_EMBEDDINGS_ONNX_MODEL_PATH'] = str(pathlib.Path(a.model_path).resolve())
if a.compact:
    env['HINDSIGHT_API_EMBEDDINGS_ONNX_FILE'] = 'onnx/model_qint8_avx512_vnni.onnx'
    env['HINDSIGHT_API_ENABLE_GRAPH_RETRIEVAL'] = 'false'
    env['HINDSIGHT_API_ENABLE_TEMPORAL_RETRIEVAL'] = 'false'
pg = Pg0(name='ework-hindsight-validation-20261107', database='hindsight',
         data_dir=str(runtime / 'postgres'), config={'listen_addresses':'127.0.0.1'})
stop = threading.Event()
shutdown_requested = threading.Event()
tracked = {os.getpid()}
scan_roots = {os.getpid()}
started = time.monotonic()
server = None
pg_started = False

def monitor():
    with (evidence / f'resources-{a.label}.jsonl').open('w') as out:
        while not stop.wait(.25):
            processes = {}
            for pid in list(scan_roots):
                try:
                    proc = psutil.Process(pid)
                    for child in [proc, *proc.children(recursive=True)]:
                        processes[child.pid] = child
                        tracked.add(child.pid)
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass
            for pid in list(tracked):
                if pid not in processes:
                    try: processes[pid] = psutil.Process(pid)
                    except psutil.NoSuchProcess: pass
            rss = cpu = supervisor_cpu = 0
            alive = []
            for pid, proc in processes.items():
                try:
                    rss += proc.memory_info().rss
                    ct = proc.cpu_times(); cpu += ct.user + ct.system
                    if pid == os.getpid(): supervisor_cpu = ct.user + ct.system
                    alive.append(pid)
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass
            phase_file = evidence / 'phase.txt'
            phase = phase_file.read_text().strip() if phase_file.exists() else 'startup'
            out.write(json.dumps({'elapsedSeconds':time.monotonic()-started,'phase':phase,
                                  'rssBytes':rss,'cpuSeconds':cpu,'supervisorCpuSeconds':supervisor_cpu,
                                  'workloadCpuSeconds':cpu-supervisor_cpu,'pids':alive})+'\n')
            out.flush()

def cleanup(*_):
    stop.set()
    if server and server.poll() is None:
        server.terminate()
        try: server.wait(15)
        except subprocess.TimeoutExpired: server.kill(); server.wait()
    if pg_started: pg.stop()

# Do not call Popen.wait/poll from a signal handler: a signal can interrupt a
# main-thread wait while its internal lock is held, causing a reentrant deadlock.
signal.signal(signal.SIGTERM, lambda *_: shutdown_requested.set())
signal.signal(signal.SIGINT, lambda *_: shutdown_requested.set())
threading.Thread(target=monitor, daemon=True).start()
try:
    (evidence / 'phase.txt').write_text('startup')
    info = pg.start()
    pg_started = True
    if info.pid: tracked.add(info.pid); scan_roots.add(info.pid)
    env['HINDSIGHT_API_DATABASE_URL'] = info.uri
    print(json.dumps({'stage':'postgres-ready','seconds':time.monotonic()-started,'pid':info.pid}), flush=True)
    server = subprocess.Popen([sys.executable, '-m', 'hindsight_api.main', '--host', '127.0.0.1',
                               '--port', str(a.port), '--workers', '1', '--log-level', 'warning'],
                              env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    tracked.add(server.pid)
    (evidence / 'service-state.json').write_text(json.dumps({'supervisorPid':os.getpid(),
        'serverPid':server.pid,'databasePid':info.pid,'port':a.port,'label':a.label}))
    def logs():
        with (evidence / f'service-{a.label}.log').open('w') as out:
            for line in server.stdout:
                for secret in secrets: line = line.replace(secret, '[REDACTED]')
                if info.uri: line = line.replace(info.uri, '[LOCAL_DATABASE]')
                out.write(line); out.flush()
    threading.Thread(target=logs, daemon=True).start()
    while server.poll() is None and not shutdown_requested.is_set():
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{a.port}/health/ready',timeout=2) as response:
                if response.status == 200: break
        except Exception: time.sleep(.25)
    if shutdown_requested.is_set(): raise SystemExit(0)
    if server.poll() is not None: raise RuntimeError('Hindsight exited; inspect redacted service log')
    ready = {'label':a.label,'readySeconds':time.monotonic()-started,'model':'GLM-5.3-Flash',
             'embedding':'intfloat/multilingual-e5-small','reranker':'rrf','databasePort':info.port,
             'compact':a.compact,'embeddingFile':env.get('HINDSIGHT_API_EMBEDDINGS_ONNX_FILE','onnx/model.onnx')}
    (evidence / f'startup-{a.label}.json').write_text(json.dumps(ready,indent=2))
    (evidence / 'phase.txt').write_text('idle')
    print(json.dumps({'stage':'api-ready',**ready}),flush=True)
    while server.poll() is None and not shutdown_requested.wait(.25):
        pass
finally:
    cleanup()
