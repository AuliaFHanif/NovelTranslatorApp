sequelize-cli model:generate --name Series --attributes "title:string,genre:string,description:text,language:enum" 


sequelize-cli model:generate --name Chapter --attributes "seriesId:uuid,number:integer,title:string,rawText:text,translatedText:text" 


sequelize-cli model:generate --name Act --attributes "chapterId:uuid,seriesId:uuid,order:integer,content:text" 


sequelize-cli model:generate --name Glossary --attributes "name:string,type:enum(character|location|item|concept),language_notes:json" 


sequelize-cli model:generate --name GlossaryEntry --attributes "glossaryId:uuid,scope:enum(series|chapter|act),scopeId:uuid,term_ja:string,term_zh:string,term_en:string,definition:text,metadata:json"