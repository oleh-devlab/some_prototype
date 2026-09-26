// Точка вибору джерела даних. UI імпортує лише createRepository() і викликає методи інтерфейсу.
//
// Інтерфейс ScheduleRepository (усі методи асинхронні):
//   load()                               -> підготувати дані (для API — no-op)
//   refresh()                            -> true, якщо дані на сервері змінилися
//   getMeta()                            -> { source, generatedAt, range:{from,to}, coverage, errors, offline, bells, lessonDates }
//   listGroups()                         -> [{ id, name, faculty, hint, status, statusMessage }]
//   findGroup({ id, name })              -> group | null
//   getGroupSchedule(groupId, range)     -> { group, lessons: Lesson[] }
//   listRooms()                          -> [{ key, label, building, buildingName, lessonsCount }]
//   getRoomSchedule(roomKey, range)      -> { room, lessons: Lesson[] }
//   listTeachers()                       -> [{ key, name, short, position, department, lessonsCount }]
//   getTeacherSchedule(teacherKey, range)-> { teacher, lessons: Lesson[] }
//
// range = { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }; модель Lesson описана в domain/lessons.js.

import { ApiRepository } from './api-repository.js';
import { StaticRepository } from './static-repository.js';

export function createRepository(config) {
  switch (config.kind) {
    case 'api':
      return new ApiRepository(config);
    case 'static':
    default:
      return new StaticRepository(config);
  }
}
