document.body.dataset.mode='interact';
const form=document.querySelector('#chat-form');
form?.addEventListener('submit',e=>{e.preventDefault();const input=document.querySelector('#message');const answer=document.querySelector('#answer');if(answer&&input)answer.textContent=input.value.trim()?'本地原型已收到：'+input.value.trim()+'。没有连接真实 Agent。':'请输入一条消息。'});
document.querySelector('#new-task')?.addEventListener('click',()=>{const answer=document.querySelector('#answer');if(answer)answer.textContent='本地任务草稿已打开。可在下方输入任务内容。';document.querySelector('#message')?.focus()});
