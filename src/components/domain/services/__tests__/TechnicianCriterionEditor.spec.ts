import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TechnicianCriterionEditor from '@/components/domain/services/TechnicianCriterionEditor.vue'
import type { TechnicianCriterion, TechnicianCriterionEvaluationMutation } from '@/types/technicianServices'

const criterion: TechnicianCriterion = {
  id: '10000000-0000-4000-8000-000000000001',
  criterioId: '10000000-0000-4000-8000-000000000002',
  nombre: 'Mantenimiento higiénico',
  soloAreaExterna: false,
  evaluacion: null,
  observacion: null,
  evidenciasStoragePaths: [],
  version: 1,
}

describe('TechnicianCriterionEditor', () => {
  it('saves the selected fixed evaluation with the current observation', async () => {
    const wrapper = mount(TechnicianCriterionEditor, { props: { criterion, mutation: null, editable: true, syncing: false } })
    await wrapper.findAll('.criterion-tools button')[0]!.trigger('click')
    await wrapper.get('textarea').setValue('Limpieza parcial')
    await wrapper.get('button[aria-label="Cumple parcialmente"]').trigger('click')
    expect(wrapper.emitted('save')?.[0]).toEqual(['CP', 'Limpieza parcial', [], []])
  })

  it('blocks editing during a conflict and exposes explicit resolution actions', async () => {
    const mutation: TechnicianCriterionEvaluationMutation = {
      schemaVersion: 1,
      requestId: '10000000-0000-4000-8000-000000000003',
      actorId: '10000000-0000-4000-8000-000000000004',
      serviceId: '10000000-0000-4000-8000-000000000005',
      deviceId: '10000000-0000-4000-8000-000000000006',
      lockToken: '10000000-0000-4000-8000-000000000007',
      kind: 'CRITERION_EVALUATION',
      areaId: '10000000-0000-4000-8000-000000000008',
      criterionId: criterion.id,
      evaluation: 'NC',
      observation: 'Respuesta local',
      evidences: [],
      retainedEvidenceStoragePaths: [],
      version: 1,
      status: 'CONFLICT',
      createdAt: '2026-10-07T13:00:00Z',
      updatedAt: '2026-10-07T13:00:00Z',
      conflict: { ...criterion, evaluacion: 'C', version: 2 },
      error: 'La respuesta cambió.',
    }
    const wrapper = mount(TechnicianCriterionEditor, { props: { criterion: { ...criterion, evaluacion: 'NC' }, mutation, editable: true, syncing: false } })
    expect(wrapper.get('button[aria-label="Cumple"]').attributes('disabled')).toBeDefined()
    const actions = wrapper.findAll('.criterion-actions button')
    await actions[0]!.trigger('click')
    await actions[1]!.trigger('click')
    expect(wrapper.emitted('useRemote')).toHaveLength(1)
    expect(wrapper.emitted('retry')).toHaveLength(1)
  })
})
