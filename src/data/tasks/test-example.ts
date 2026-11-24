export default {
  // Уникальный идентификатор теста.
  // При обновлении теста не меняй его.
  key: 'example-algebra-8',

  // Название теста
  title: 'Пример теста по алгебре',

  // Для какого класса предназначен тест
  grade: 8,

  // Предмет и тема
  subject: 'Алгебра',
  topic: 'Линейные уравнения',

  // Вопросы теста
  questions: [
    {
      id: 'q1',
      type: 'single',
      text: 'Чему равно x, если x + 5 = 12?',
      options: [
        { id: 'a1', text: '5', correct: false },
        { id: 'a2', text: '7', correct: true },
        { id: 'a3', text: '8', correct: false },
        { id: 'a4', text: '17', correct: false },
      ],
      explanation: 'Переносим 5 в правую часть: x = 12 - 5 = 7.',
    },
    {
      id: 'q2',
      type: 'bool',
      text: 'Уравнение 2x = 10 имеет корень x = 5.',
      options: [],
      answer: true,
    },
  ],
}