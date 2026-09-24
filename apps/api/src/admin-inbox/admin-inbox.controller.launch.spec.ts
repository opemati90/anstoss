import { NotFoundException } from '@nestjs/common'
import { AdminInboxController } from './admin-inbox.controller'

describe('AdminInboxController launch compliance kill switch', () => {
  it('rejects every compliance route before it reads or writes sensitive records', () => {
    const compliance = {
      list: jest.fn(),
      upsert: jest.fn(),
      remind: jest.fn(),
      update: jest.fn(),
    }
    const controller = new AdminInboxController({} as never, compliance as never)
    const actor = { id: 'admin-1' }

    expect(() => controller.listCompliance('club-1')).toThrow(NotFoundException)
    expect(() => controller.upsertCompliance('club-1', actor, {})).toThrow(NotFoundException)
    expect(() => controller.remindCompliance('club-1', actor, {})).toThrow(NotFoundException)
    expect(() => controller.updateCompliance('club-1', 'record-1', actor, {})).toThrow(
      NotFoundException,
    )
    for (const method of Object.values(compliance)) expect(method).not.toHaveBeenCalled()
  })
})
