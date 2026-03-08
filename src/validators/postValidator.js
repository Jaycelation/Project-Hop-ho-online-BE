const { z } = require("zod");

const createPostSchema = z.object({
    content: z.string().min(1, "Nội dung bài viết không được để trống").max(5000, "Nội dung quá dài (tối đa 5000 ký tự)"),
    feeling: z.string().optional(),
    image_url: z.string().url("Định dạng ảnh không hợp lệ").optional().or(z.literal("")),
    imageUrl: z.string().url("Định dạng ảnh không hợp lệ").optional().or(z.literal("")),
    image: z.string().url("Định dạng ảnh không hợp lệ").optional().or(z.literal(""))
});

const updatePostSchema = z.object({
    content: z.string().min(1, "Nội dung bài viết không được để trống").max(5000, "Nội dung quá dài (tối đa 5000 ký tự)").optional(),
    feeling: z.string().optional(),
    image_url: z.string().url("Định dạng ảnh không hợp lệ").optional().or(z.literal("")),
    imageUrl: z.string().url("Định dạng ảnh không hợp lệ").optional().or(z.literal("")),
    image: z.string().url("Định dạng ảnh không hợp lệ").optional().or(z.literal(""))
});

const commentSchema = z.object({
    content: z.string().min(1, "Nội dung bình luận không được để trống").max(1000, "Bình luận quá dài (tối đa 1000 ký tự)")
});

module.exports = {
    createPostSchema,
    updatePostSchema,
    commentSchema
};
