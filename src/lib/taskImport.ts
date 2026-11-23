import type { Question } from '../types'
import { supabase, q } from './supabase'

const taskModules = import.meta.glob('../data/tasks/**/*.ts', {
eager: true,
import: 'default',
})

export interface TaskFile {
key: string
title: string
grade: number
subject: string
topic: string
questions: Question[]
}

export function getTaskFiles(): TaskFile[] {
return Object.values(taskModules) as TaskFile[]
}

export async function importTasks(ownerId: string) {
const tasks = getTaskFiles()

if (!tasks.length) {
return { imported: 0, message: 'Файлы с тестами не найдены.' }
}

let imported = 0

for (const task of tasks) {
if (
!task.key ||
!task.title ||
!Number.isInteger(task.grade) ||
!Array.isArray(task.questions)
) {
throw new Error(`Проверь данные теста: ${task.title || 'без названия'}`)
}

const folderName = `${task.grade} класс`

const folders = await q<{ id: string }[]>(
  supabase
    .from('folders')
    .select('id')
    .eq('owner_id', ownerId)
    .eq('name', folderName)
    .is('parent_id', null)
)

let folderId = folders[0]?.id

if (!folderId) {
  const created = await q<{ id: string }[]>(
    supabase
      .from('folders')
      .insert({
        owner_id: ownerId,
        name: folderName,
        parent_id: null,
      })
      .select('id')
  )

  folderId = created[0].id
}

await q(
  supabase
    .from('tasks')
    .upsert(
      {
        owner_id: ownerId,
        source_key: task.key,
        title: `${task.subject}: ${task.title}`,
        folder_id: folderId,
        questions: task.questions,
      },
      { onConflict: 'owner_id,source_key' }
    )
    .select()
)

imported++
}

return {
imported,
message: `Обработано тестов: ${imported}`,
}
}