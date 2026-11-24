-- Добавляем уникальный ключ для тестов,
-- созданных через файлы проекта.
ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS source_key text;

-- Один и тот же файл не сможет создать
-- несколько одинаковых записей у одного преподавателя.
CREATE UNIQUE INDEX IF NOT EXISTS tasks_owner_source_key_unique
ON public.tasks (owner_id, source_key);