import React from 'react';

const TYPE_COLORS = {
  mcq:                      'bg-indigo-100 text-indigo-600 border-indigo-200',
  true_false:               'bg-sky-100 text-sky-600 border-sky-200',
  fill_blank:               'bg-amber-100 text-amber-700 border-amber-200',
  short_answer:             'bg-violet-100 text-violet-600 border-violet-200',
  practical_vm:             'bg-orange-100 text-orange-600 border-orange-200',
};

export default function QuestionCard({ question: q, index, onEdit, onDelete }) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-700 p-4 flex gap-3">
      <span className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-100 border border-indigo-300 text-indigo-600 flex items-center justify-center text-xs font-bold">
        {index + 1}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${TYPE_COLORS[q.type] || 'bg-gray-100 text-gray-500'}`}>
            {q.type?.replace('_', '-')}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-300 border border-gray-600 font-semibold">
            {q.marks} mk
          </span>
        </div>
        <p className="text-sm text-gray-200 font-medium leading-snug">{q.text}</p>
        {q.type === 'mcq' && q.options?.length > 0 && (
          <ul className="mt-1.5 flex flex-col gap-0.5">
            {q.options.map((o, i) => (
              <li key={i} className={`text-xs px-2 py-0.5 rounded ${o === q.answer_key ? 'bg-emerald-50 text-emerald-700 font-semibold' : 'text-gray-400'}`}>
                {String.fromCharCode(65+i)}. {o}
              </li>
            ))}
          </ul>
        )}
        {q.answer_key && q.type !== 'mcq' && (
          <p className="text-xs text-emerald-600 mt-1">Answer: {q.answer_key}</p>
        )}
      </div>
      <div className="flex flex-col gap-1.5 flex-shrink-0">
        <button onClick={onEdit}
          className="px-2.5 py-1 rounded-lg text-xs bg-indigo-50 text-indigo-600 border border-indigo-200 hover:bg-indigo-100 transition font-semibold">
          Edit
        </button>
        <button onClick={onDelete}
          className="px-2.5 py-1 rounded-lg text-xs bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition font-semibold">
          Del
        </button>
      </div>
    </div>
  );
}
