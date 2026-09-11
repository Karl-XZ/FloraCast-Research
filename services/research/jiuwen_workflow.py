"""openJiuwen owns the stage graph; Node supplies registered scientific tools over stdio.

Protocol: component emits request(stage), awaits result(stage, outputHash). The parent
executes shared, deterministic research tools. No LLM or API key is required for this
workflow; reasoning agents are a separate application layer.
"""
import asyncio
import json
import sys
from importlib.metadata import version

# SDK logging can emit on stdout: retain a dedicated protocol writer and redirect logs.
protocol_stdout = sys.stdout
sys.stdout = sys.stderr
from openjiuwen.core.workflow import Workflow, WorkflowCard, WorkflowComponent, Start, End
from openjiuwen.core.runner import Runner

STAGES = ['protocol', 'literature', 'data', 'geo', 'statistics', 'evidence', 'reproduce', 'report']


def emit(data):
    protocol_stdout.write(json.dumps(data) + '\n')
    protocol_stdout.flush()


class ResearchStage(WorkflowComponent):
    def __init__(self, name):
        super().__init__()
        self.name = name

    async def invoke(self, inputs, session, context):
        emit({'type': 'request', 'stage': self.name})
        line = await asyncio.to_thread(sys.stdin.readline)
        if not line:
            raise RuntimeError('Scientific tool transport closed')
        result = json.loads(line)
        if result.get('stage') != self.name or not result.get('outputHash'):
            raise RuntimeError('Scientific tool returned an invalid stage acknowledgment')
        return {'outputHash': result['outputHash']}


async def main():
    flow = Workflow(card=WorkflowCard(id='floracast_research', name='FloraCast research workflow', version='1.0'))
    flow.set_start_comp('start', Start(), inputs_schema={'query': '${query}'})
    previous = 'start'
    for name in STAGES:
        flow.add_workflow_comp(name, ResearchStage(name), inputs_schema={})
        flow.add_connection(previous, name)
        previous = name
    flow.set_end_comp('end', End(), inputs_schema={'hash': '${report.outputHash}'})
    flow.add_connection(previous, 'end')
    emit({'type': 'ready', 'sdk': 'openjiuwen', 'version': version('openjiuwen')})
    try:
        result = await Runner.run_workflow(flow, {'query': 'execute frozen research protocol'})
        if result.state.value != 'COMPLETED':
            raise RuntimeError(f'Workflow did not complete: {result.state}')
        emit({'type': 'complete', 'output': str(result.result)})
    finally:
        await Runner.stop()


if __name__ == '__main__':
    asyncio.run(main())
